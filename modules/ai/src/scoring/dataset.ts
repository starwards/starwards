/**
 * Builds the snapshot-scoring dataset: one row per recorded frame (1 Hz) with the scorer's features
 * and the future-of-run labels, from training-archive manifests.
 *
 *   npm --prefix modules/ai run score:dataset -- [--archive <dir>] [--days 2026-10-02,...] [--out <file.csv>] [--limit N] [--exclude <path prefix>,...]
 *
 * Defaults: archive `../training-archive` beside the repo, every `<day>/manifest.jsonl` in it, output
 * `<archive>/datasets/snapshots-<days>.csv` plus a `.manifest.json` with row counts and a content hash.
 * `--exclude` leaves out the runs whose manifest path starts with a prefix (e.g. a confirmation set kept out of training).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FEATURE_NAMES, extractFeatures, findDuel } from './features';
import { LABELS, LabelName, duelLabelsAt, runLabels, summarize } from './labels';
import { readEvents, readFrames } from './recording';

interface ManifestLine {
    path: string;
    source: string;
    group: string;
    map: string;
    seed: number | null;
    live: boolean;
    frames: number;
    stations?: Record<string, { brain: string; version: number; policy: string }>;
    outcome?: { scenario?: string; killed?: boolean } | null;
    codeCommit?: string;
    energyModel?: { powerDrawExponent: number } | null;
}

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const STATIONS = ['helms', 'weapons', 'engineer', 'signals'] as const;
const META = [
    'run_id',
    'day',
    'source',
    'group',
    'map',
    'scenario',
    'seed',
    'live',
    'policy',
    ...STATIONS.map((s) => `policy_${s}`),
    'code_commit',
    'power_draw_exponent',
    'weapons_events',
    'frame',
    't',
    'target_id',
];

const csvCell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The run's crew policy: `jev` if any station ran on Jev, else `reference`/`idle`/`mixed` over the stations that ran. */
function crewPolicy(stations: ManifestLine['stations']) {
    const policies = new Set(Object.values(stations ?? {}).map((s) => s.policy));
    if (policies.has('jev')) return 'jev';
    return policies.size === 1 ? [...policies][0] : policies.size ? 'mixed' : 'none';
}

/**
 * Commits whose headless recorder wrote `shot` and `damage` events (archive `commits.json`). A run from
 * another commit carries them only if its sidecar shows any; otherwise its tactical and weapons labels
 * are censored.
 */
const WEAPONS_EVENT_COMMITS = new Set(['26e162b0', '465503bc', 'b9e17467', '964e85ef']);
const WEAPONS_EVENT_KINDS = new Set(['shot', 'damage', 'projectile_end']);

async function rowsFor(day: string, archive: string, line: ManifestLine) {
    const sgr = path.join(archive, day, line.path);
    const frames = await readFrames(sgr);
    const events = readEvents(sgr);
    const duels = frames.map((f) => findDuel(f.saved));
    const playerId = duels.find((d) => d)?.player.id;
    const weaponsEvents =
        WEAPONS_EVENT_COMMITS.has(line.codeCommit ?? '') || events.some((e) => WEAPONS_EVENT_KINDS.has(e.kind));
    const run = playerId ? runLabels(frames, events, playerId, weaponsEvents) : [];
    const pinned = new Map<string, ReturnType<typeof summarize>[]>();
    const rows: (string | number | boolean | null)[][] = [];
    const scenario = line.outcome?.scenario ?? path.basename(line.path).replace(/_seed\d+\.sgr$|\.sgr$/, '');
    const meta = [
        `${day}/${line.path}`,
        day,
        line.source,
        line.group,
        line.map,
        scenario,
        line.seed,
        line.live,
        crewPolicy(line.stations),
        ...STATIONS.map((s) => line.stations?.[s]?.policy ?? 'none'),
        line.codeCommit ?? '',
        line.energyModel?.powerDrawExponent ?? '',
        weaponsEvents,
    ];
    frames.forEach((frame, i) => {
        const duel = duels[i];
        if (!duel) return;
        const key = `${duel.player.id} ${duel.target.id}`;
        let summaries = pinned.get(key);
        if (!summaries) {
            summaries = frames.map((f) => summarize(f.t, f.saved, duel.player.id, duel.target.id));
            pinned.set(key, summaries);
        }
        const labels: Record<LabelName, number | null> = { ...duelLabelsAt(summaries, i), ...run[i] };
        rows.push([...meta, i, frame.t, duel.target.id, ...extractFeatures(duel), ...LABELS.map((l) => labels[l])]);
    });
    return rows;
}

async function main() {
    const archive = path.resolve(arg('archive') ?? path.join(__dirname, '../../../../../training-archive'));
    const days = (
        arg('days')?.split(',') ?? fs.readdirSync(archive).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ).sort();
    const limit = Number(arg('limit') ?? Infinity);
    const excluded = (arg('exclude') ?? '').split(',').filter(Boolean);
    const out = path.resolve(arg('out') ?? path.join(archive, 'datasets', `snapshots-${days.join('_')}.csv`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const header = [...META, ...FEATURE_NAMES, ...LABELS];
    const hash = crypto.createHash('sha256');
    const write = (cells: (string | number | boolean | null)[]) => {
        const text = cells.map(csvCell).join(',') + '\n';
        hash.update(text);
        fs.appendFileSync(out, text);
    };
    fs.writeFileSync(out, '');
    write(header);
    let runs = 0;
    let rows = 0;
    const skipped: string[] = [];
    for (const day of days) {
        const lines = fs
            .readFileSync(path.join(archive, day, 'manifest.jsonl'), 'utf8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as ManifestLine)
            .filter((l) => !excluded.some((prefix) => l.path.startsWith(prefix)))
            .sort((a, c) => (a.path < c.path ? -1 : 1));
        for (const line of lines) {
            if (runs >= limit) break;
            try {
                const runRows = await rowsFor(day, archive, line);
                runRows.forEach(write);
                rows += runRows.length;
                runs++;
                if (runs % 50 === 0) process.stderr.write(`${runs} runs, ${rows} rows\n`);
            } catch (err) {
                skipped.push(`${day}/${line.path}: ${(err as Error).message}`);
            }
        }
    }
    const manifest = {
        out: path.basename(out),
        days,
        runs,
        rows,
        skipped,
        features: FEATURE_NAMES,
        labels: LABELS,
        sha256: hash.digest('hex'),
    };
    fs.writeFileSync(out.replace(/\.csv$/, '.manifest.json'), JSON.stringify(manifest, null, 2));
    process.stdout.write(`${out}: ${runs} runs, ${rows} rows, ${skipped.length} skipped\n`);
}

void main();
