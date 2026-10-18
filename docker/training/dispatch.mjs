// Filler dispatcher: keeps the cluster's training slots busy with rolling filler Jobs (rolling.sh) and
// yields them to every other Job. Run every few minutes by the filler-dispatcher CronJob; see
// docs/integration/ai-training-k3s.md, "Continuous training".
//
// - Demand: any unfinished Job without label role=filler (ad-hoc role=adhoc, nightly, anything else) that
//   is not ignored. Demand present: no new filler, so a slot frees when the next filler shard ends.
// - Due: a non-suspended CronJob (other than ignored ones) fires within HORIZON_MIN minutes: fillers capped
//   at SLOTS - 1, so the CronJob finds a slot.
// - Otherwise fillers fill up to SLOTS. A filler lane CronJob that is not suspended reserves one slot.
// Fillers are Jobs made from the jobTemplate of the lane's CronJob rolling-<lane> (suspended while the
// dispatcher runs), labelled role=filler and starwards/lane=<lane>; lanes are picked by LANE_WEIGHTS
// against the fillers already running.
//
// Env: NAMESPACE, SLOTS (3), HORIZON_MIN (60), LANE_WEIGHTS (branch=2,sweep=1),
// IGNORE (comma-separated name prefixes, default filler-dispatcher,archive-retention), DRY_RUN=1,
// KUBE_API (outside the cluster, e.g. http://127.0.0.1:8001 from `kubectl proxy`).
import fs from 'node:fs';

const env = (k, d) => process.env[k] ?? d;
const NS = env('NAMESPACE', 'starwards-training');
const SLOTS = Number(env('SLOTS', '3'));
const HORIZON = Number(env('HORIZON_MIN', '60'));
const IGNORE = env('IGNORE', 'filler-dispatcher,archive-retention').split(',').filter(Boolean);
const WEIGHTS = Object.fromEntries(
    env('LANE_WEIGHTS', 'branch=2,sweep=1')
        .split(',')
        .map((p) => p.split('='))
        .map(([k, v]) => [k, Number(v)]),
);
const TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const inCluster = fs.existsSync(TOKEN_FILE);
const API = env('KUBE_API', inCluster ? 'https://kubernetes.default.svc' : 'http://127.0.0.1:8001');

async function api(path, init = {}) {
    const headers = { 'content-type': 'application/json' };
    if (inCluster) headers.authorization = `Bearer ${fs.readFileSync(TOKEN_FILE, 'utf8').trim()}`;
    const res = await fetch(API + path, { ...init, headers });
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
}

const ignored = (name) => IGNORE.some((p) => name.startsWith(p));
const finished = (job) =>
    (job.status?.conditions ?? []).some((c) => (c.type === 'Complete' || c.type === 'Failed') && c.status === 'True');

// 5-field cron: *, */n, a-b, a-b/n, lists
function field(spec, value, min) {
    return spec.split(',').some((part) => {
        const [range, step = '1'] = part.split('/');
        let lo, hi;
        if (range === '*') [lo, hi] = [min, Infinity];
        else if (range.includes('-')) [lo, hi] = range.split('-').map(Number);
        else [lo, hi] = [Number(range), step === '1' ? Number(range) : Infinity];
        return value >= lo && value <= hi && (value - lo) % Number(step) === 0;
    });
}
function localParts(date, timeZone) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short',
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { minute: +parts.minute, hour: +parts.hour, day: +parts.day, month: +parts.month, dow };
}
function dueWithin(schedule, timeZone, minutes, now = new Date()) {
    const [mi, h, dom, mon, dow] = schedule.trim().split(/\s+/);
    const start = Math.ceil(now.getTime() / 60000) * 60000;
    for (let i = 0; i <= minutes; i++) {
        const t = localParts(new Date(start + i * 60000), timeZone || 'UTC');
        if (field(mi, t.minute, 0) && field(h, t.hour, 0) && field(dom, t.day, 1) && field(mon, t.month, 1) &&
            field(dow, t.dow, 0)) return i;
    }
    return null;
}

const [jobs, crons] = await Promise.all([
    api(`/apis/batch/v1/namespaces/${NS}/jobs`),
    api(`/apis/batch/v1/namespaces/${NS}/cronjobs`),
]);
const live = jobs.items.filter((j) => !finished(j) && !j.spec.suspend);
const fillers = live.filter((j) => j.metadata.labels?.role === 'filler');
const demand = live.filter((j) => j.metadata.labels?.role !== 'filler' && !ignored(j.metadata.name));
const due = crons.items
    // filler lanes are fillers themselves, not work to make room for
    .filter((c) => !c.spec.suspend && !ignored(c.metadata.name) && c.spec.jobTemplate.metadata?.labels?.role !== 'filler')
    .map((c) => ({ name: c.metadata.name, in: dueWithin(c.spec.schedule, c.spec.timeZone, HORIZON) }))
    .filter((c) => c.in !== null);
// a running filler lane (CronJob rolling-<lane>, not suspended) holds its slot even between its cycles
const lanes = crons.items.filter((c) => !c.spec.suspend && c.spec.jobTemplate.metadata?.labels?.role === 'filler');
const own = fillers.filter((j) => !(j.metadata.ownerReferences ?? []).some((o) => o.kind === 'CronJob'));
const cap = due.length ? SLOTS - 1 : SLOTS;
const launch = demand.length ? 0 : Math.max(0, cap - lanes.length - own.length);
console.log(
    JSON.stringify({
        at: new Date().toISOString(),
        fillers: fillers.map((j) => j.metadata.name),
        demand: demand.map((j) => j.metadata.name),
        lanes: lanes.map((c) => c.metadata.name),
        due,
        cap,
        launch,
    }),
);
if (launch === 0) process.exit(0);

const running = {};
for (const j of fillers) {
    const lane = j.metadata.labels?.['starwards/lane'];
    running[lane] = (running[lane] ?? 0) + 1;
}
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
for (let i = 0; i < launch; i++) {
    // Jev fillers spend money: at most one at a time (the spend ledger caps the total)
    const lanes = Object.keys(WEIGHTS).filter((l) => l !== 'jev' || !running.jev);
    const lane = lanes.sort((a, b) => (running[a] ?? 0) / WEIGHTS[a] - (running[b] ?? 0) / WEIGHTS[b])[0];
    running[lane] = (running[lane] ?? 0) + 1;
    const template = await api(`/apis/batch/v1/namespaces/${NS}/cronjobs/rolling-${lane}`);
    const spec = structuredClone(template.spec.jobTemplate.spec);
    const labels = {
        ...(template.spec.jobTemplate.metadata?.labels ?? {}),
        role: 'filler',
        'starwards/lane': lane,
        ...(lane === 'jev' ? { jev: 'true' } : {}),
    };
    spec.template.metadata = { ...(spec.template.metadata ?? {}) };
    spec.template.metadata.labels = { ...(spec.template.metadata.labels ?? {}), ...labels };
    const job = { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: `filler-${lane}-${stamp}-${i}`, labels }, spec };
    if (env('DRY_RUN', '') === '1') {
        console.log(`would create ${job.metadata.name}`);
        continue;
    }
    await api(`/apis/batch/v1/namespaces/${NS}/jobs`, { method: 'POST', body: JSON.stringify(job) });
    console.log(`created ${job.metadata.name}`);
}
