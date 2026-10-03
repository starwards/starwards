/**
 * Builds the snapshot-scoring dataset: one row per recorded frame (1 Hz) with the scorer's features
 * and the future-of-run labels, from training-archive manifests.
 *
 *   npm --prefix modules/ai run score:dataset -- [--archive <dir>] [--days 2026-10-02,...] [--out <file.csv>] [--limit N]
 *
 * Defaults: archive `../training-archive` beside the repo, every `<day>/manifest.jsonl` in it, output
 * `<archive>/datasets/snapshots-<days>.csv` plus a `.manifest.json` with row counts and a content hash.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FEATURE_NAMES, extractFeatures, findDuel } from './features';
import { LABELS, labelsAt, summarize } from './labels';
import { components, engineerKpi30, observe } from './engineer-kpi';
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
 * `engineer_kpi30` by frame index, for the frames the player ship is alive in (see `engineer-kpi.ts`).
 */
function engineerLabels(
    frames: { t: number; saved: Parameters<typeof observe>[1] }[],
    events: ReturnType<typeof readEvents>,
    playerId: string | undefined,
) {
    const labels = new Map<number, number | null>();
    if (!playerId) return labels;
    const seen = frames.flatMap((f, i) => {
        const o = observe(f.t, f.saved, playerId);
        return o ? [{ i, o }] : [];
    });
    if (!seen.length) return labels;
    const cs = components(
        seen.map((s) => s.o),
        events,
        playerId,
    );
    const kpi30 = engineerKpi30(cs);
    seen.forEach((s, j) => labels.set(s.i, kpi30[j]));
    return labels;
}

async function rowsFor(day: string, archive: string, line: ManifestLine) {
    const sgr = path.join(archive, day, line.path);
    const frames = await readFrames(sgr);
    const duels = frames.map((f) => findDuel(f.saved));
    const engineer = engineerLabels(frames, readEvents(sgr), duels.find((d) => d)?.player.id);
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
        const labels = labelsAt(summaries, i);
        rows.push([
            ...meta,
            i,
            frame.t,
            duel.target.id,
            ...extractFeatures(duel),
            ...LABELS.map((l) => labels[l]),
            engineer.get(i) ?? null,
        ]);
    });
    return rows;
}

async function main() {
    const archive = path.resolve(arg('archive') ?? path.join(__dirname, '../../../../../training-archive'));
    const days = (
        arg('days')?.split(',') ?? fs.readdirSync(archive).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ).sort();
    const limit = Number(arg('limit') ?? Infinity);
    const out = path.resolve(arg('out') ?? path.join(archive, 'datasets', `snapshots-${days.join('_')}.csv`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const header = [...META, ...FEATURE_NAMES, ...LABELS, 'engineer_kpi30'];
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
        labels: [...LABELS, 'engineer_kpi30'],
        sha256: hash.digest('hex'),
    };
    fs.writeFileSync(out.replace(/\.csv$/, '.manifest.json'), JSON.stringify(manifest, null, 2));
    process.stdout.write(`${out}: ${runs} runs, ${rows} rows, ${skipped.length} skipped\n`);
}

void main();
