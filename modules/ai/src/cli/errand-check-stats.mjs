// ERRAND-PLAN step 1 aggregation over errand-check.ts rows.
//   node errand-check-stats.mjs <rows-dir> <waves.json>...
// Calibrates on even seeds, reports on odd seeds.
import fs from 'node:fs';
import path from 'node:path';

const [dir, ...wavesFiles] = process.argv.slice(2);
const meta = new Map();
for (const f of wavesFiles) for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) meta.set(r.seed, r);
const runs = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl')))
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n'))
        if (line.trim()) {
            const r = JSON.parse(line);
            r.seed = Number(/seed(\d+)/.exec(r.file)[1]);
            r.meta = meta.get(r.seed);
            if (r.meta) runs.push(r);
        }
const isCal = (r) => r.seed % 2 === 0;
const STATIONS = ['station-large', 'station-platform', 'station-small'];

const tierMid = (h) => (h > 0.9 ? 0.95 : h > 0.4 ? 0.65 : h > 0.15 ? 0.275 : 0.075);
const tierLow = (h) => (h > 0.9 ? 0.9 : h > 0.4 ? 0.4 : h > 0.15 ? 0.15 : 0.0375);
const count = (by) => Object.values(by).reduce((a, b) => a + b, 0);

// per-station series: [{t, cap, n5, n8}], loss time
function series(r, id) {
    const s = [];
    let loss = null;
    for (let i = 0; i < r.frames.length; i++) {
        const f = r.frames[i];
        const x = f.st[id];
        if (!x) {
            if (s.length && loss === null) loss = (r.frames[i - 1].t + f.t) / 2;
            break;
        }
        s.push({ t: f.t, cap: x.cap, hr: x.hr, n: x.near.map(count) });
    }
    return { s, loss };
}

// calibrate per-raider capsule DPS for each range: capsule loss / raider-seconds in range
function calibrate(ri, ids = STATIONS, damagedOnly = false) {
    let loss = 0,
        rs = 0;
    for (const r of runs.filter(isCal))
        for (const id of ids) {
            const { s, loss: tl } = series(r, id);
            for (let i = 1; i < s.length; i++) {
                if (damagedOnly && s[i - 1].cap >= 1) continue;
                const dt = s[i].t - s[i - 1].t;
                rs += s[i - 1].n[ri] * dt;
                loss += Math.max(0, s[i - 1].cap - s[i].cap);
            }
            if (tl !== null && s.length) {
                rs += s[s.length - 1].n[ri] * (tl - s[s.length - 1].t);
                loss += s[s.length - 1].cap;
            }
        }
    return loss / rs;
}

function spearman(a, b) {
    const rank = (v) => {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(v.length);
        for (let i = 0; i < idx.length;) {
            let j = i;
            while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
            for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
            i = j + 1;
        }
        return r;
    };
    const ra = rank(a),
        rb = rank(b),
        n = a.length;
    const ma = ra.reduce((x, y) => x + y) / n,
        mb = rb.reduce((x, y) => x + y) / n;
    let num = 0,
        da = 0,
        db = 0;
    for (let i = 0; i < n; i++) {
        num += (ra[i] - ma) * (rb[i] - mb);
        da += (ra[i] - ma) ** 2;
        db += (rb[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
}
const median = (v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

const out = [];
const log = (s) => out.push(s);
const testFail = runs.filter((r) => !isCal(r) && !r.meta.passed);
log(`runs ${runs.length} (cal ${runs.filter(isCal).length}); test FAIL runs ${testFail.length}`);

// TTD evaluation
function evalTtd(label, hullFn, dpsFn, sel) {
    const pred = [],
        act = [],
        errs = [],
        ratio = [];
    let inf = 0,
        stationsN = 0;
    for (const r of testFail)
        for (const id of STATIONS) {
            const { s, loss } = series(r, id);
            if (loss === null) continue;
            stationsN++;
            const pts = s.map((p, i) => ({ p, i })).filter(({ p }) => p.cap < 1 && p.t < loss);
            for (const { p, i } of sel(pts)) {
                const dps = dpsFn(s, i, id);
                const ttd = dps > 0 ? hullFn(p.cap) / dps : Infinity;
                const a = loss - p.t;
                if (!isFinite(ttd)) inf++;
                pred.push(isFinite(ttd) ? ttd : 1e9);
                act.push(a);
                ratio.push(ttd / a);
                errs.push(isFinite(ttd) ? Math.abs(ttd - a) / a : Infinity);
            }
        }
    const k = median(ratio);
    const oracle = median(pred.map((x, j) => (x >= 1e9 ? Infinity : Math.abs(x / k - act[j]) / act[j])));
    const med = median(errs),
        rho = spearman(pred, act);
    const fin = errs.filter(isFinite);
    const pass = med < 0.3 && rho > 0.6;
    log(
        `| ${label} | ${stationsN} | ${errs.length} | ${((inf / errs.length) * 100).toFixed(0)}% | ${(med * 100).toFixed(0)}% | ${(median(fin) * 100).toFixed(0)}% | ${median(ratio).toFixed(2)} | ${(oracle * 100).toFixed(0)}% | ${rho.toFixed(2)} | ${pass ? 'PASS' : 'FAIL'} |`,
    );
}
const all = (pts) => pts;
const first = (pts) => pts.slice(0, 1);
const hulls = { raw: (h) => h, tierMid, tierLow };
log('\n## TTD (test FAIL runs, lost stations; points = 5 s frames from first capsule loss to loss)');
log(
    '| variant | stations | points | TTD=inf | median abs err (inf counts) | median err finite | median pred/actual | median err after oracle rescale | spearman | gate |',
);
log('|---|---|---|---|---|---|---|---|---|---|');
for (const [ri, R] of [
    [0, 5000],
    [1, 8000],
]) {
    const c = calibrate(ri);
    log(`| _design-table DPS: ${c.toExponential(2)} capsule/s per raider within ${R} m_ | | | | | | | |`);
    const cs = Object.fromEntries(STATIONS.map((id) => [id, calibrate(ri, [id], true)]));
    log(
        `| _per-station, damaged-only: ${STATIONS.map((id) => `${id} ${cs[id].toExponential(2)}`).join(', ')}_ | | | | | | | |`,
    );
    for (const [hn, hf] of Object.entries(hulls)) {
        evalTtd(`table-per-station R${R} hull=${hn} all`, hf, (s, i, id) => s[i].n[ri] * cs[id], all);
        evalTtd(`table-per-station R${R} hull=${hn} first`, hf, (s, i, id) => s[i].n[ri] * cs[id], first);
    }
    for (const [hn, hf] of Object.entries(hulls)) {
        evalTtd(`table R${R} hull=${hn} all`, hf, (s, i) => s[i].n[ri] * c, all);
        evalTtd(`table R${R} hull=${hn} first`, hf, (s, i) => s[i].n[ri] * c, first);
    }
}
for (const W of [30, 60]) {
    for (const [hn, hf] of Object.entries(hulls)) {
        const dps = (s, i) => {
            let j = i;
            while (j > 0 && s[i].t - s[j].t < W) j--;
            return s[i].t - s[j].t > 0 ? (hf(s[j].cap) - hf(s[i].cap)) / (s[i].t - s[j].t) : 0;
        };
        evalTtd(`observed-rate W${W} hull=${hn} all`, hf, dps, all);
    }
}

// Ammo deficit AUC
function auc(scores, labels) {
    const pos = scores.filter((_, i) => labels[i]),
        neg = scores.filter((_, i) => !labels[i]);
    let s = 0;
    for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
    return s / (pos.length * neg.length);
}
const frameAt = (r, t) => r.frames.reduce((b, f) => (Math.abs(f.t - t) < Math.abs(b.t - t) ? f : b));
// calibration: HE shells fired per raider kill (shells dominate HE fire)
let shells = 0,
    missiles = 0,
    kills = 0;
for (const r of runs.filter(isCal)) {
    shells += r.meta.ammo.firedTotal.HiExpShell ?? 0;
    missiles += r.meta.ammo.firedTotal.HiExpMissile ?? 0;
    kills += r.meta.fitness.raidersKilled;
}
const shellPerKill = shells / kills,
    missilePerKill = missiles / kills;
log(
    `\n## Ammo deficit (cal: ${shellPerKill.toFixed(0)} HE shells/kill, ${missilePerKill.toFixed(2)} HE missiles/kill)`,
);
log('| eval time | label | n | positives | AUC (deficit) | AUC (HE shells left, inverted) | gate |');
log('|---|---|---|---|---|---|---|');
for (const [evName, evFn] of [
    ['penultimate wave spawn +30 s', (ws) => ws[ws.length - 2] + 30],
    ['final wave spawn -10 s', (ws) => ws[ws.length - 1] - 10],
]) {
    for (const [lName, lFn] of [
        [
            'HE shells empty before final wave ends (run end or first station loss)',
            (m, ws) => (m.ammo.emptyAt.HiExpShell ?? 1e9) < (m.ammo.firstStationLostAt ?? 1500),
        ],
        ['HE shells empty at any time', (m) => m.ammo.emptyAt.HiExpShell !== undefined],
        [
            'HE shells empty before final wave spawn +120 s',
            (m, ws) => (m.ammo.emptyAt.HiExpShell ?? 1e9) < ws[ws.length - 1] + 120,
        ],
    ]) {
        const sc = [],
            sc2 = [],
            lb = [];
        for (const r of runs.filter((x) => !isCal(x))) {
            const ws = r.meta.ammo.waveSpawnAt;
            if (ws.length < 3) continue;
            const te = evFn(ws);
            const f = frameAt(r, te);
            if (!f.he) continue;
            if ((r.meta.ammo.emptyAt.HiExpShell ?? 1e9) < te) continue; // already dry: not a prediction
            const alive = f.enemies.reduce((a, e) => a + e[1], 0);
            const due = Object.values(r.meta.ammo.raiders).filter((x) => x.spawnAt > te).length; // map prior
            const need = alive + due;
            const have = f.he[1] / shellPerKill + (missilePerKill > 0 ? f.he[0] / missilePerKill : 0);
            sc.push(need - have);
            sc2.push(-f.he[1]);
            lb.push(lFn(r.meta, ws));
        }
        const a = auc(sc, lb);
        log(
            `| ${evName} | ${lName} | ${lb.length} | ${lb.filter(Boolean).length} | ${a.toFixed(2)} | ${auc(sc2, lb).toFixed(2)} | ${a > 0.7 ? 'PASS' : 'FAIL'} |`,
        );
    }
}
console.log(out.join('\n'));
