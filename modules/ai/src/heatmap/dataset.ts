/**
 * Builds the heatmap datasets from training-archive manifests (one pass over the recordings):
 *
 * - `heatmap-<days>-threat.csv`: one row per frame with a duel: frame inputs, the target's cell now,
 *   the straight-line drift cell and per-cell drift distances for Δ = 5 and 10 s, and the labels
 *   `cell5`/`cell10` = the cell (in this frame's grid) the target is in Δ seconds later.
 * - `heatmap-<days>-cells.csv`: one row per (frame every 2 s, cell the GVTS first entered within 60 s):
 *   frame inputs, the cell's position inputs, `arrive` (seconds until entry) and the labels at entry `k`:
 *   `fire` (a blast hit on the target in (k, k+10]), `danger` (the GVTS hit or losing integrity in
 *   (k, k+10]), `value` (snapshot scorer `overall.value` at k+10; 1 once the target is gone, 0 once the GVTS is).
 * - `heatmap-<days>-iso.csv`: isochrone validation: predicted time-to-reach of the GVTS's own position
 *   `dt` seconds later, against `dt`.
 *
 *   npm --prefix modules/ai run heatmap:dataset -- [--archive <dir>] [--days 2026-10-02] [--limit N]
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { CELLS, cellIndex, cellOf, timeToReach } from './grid';
import {
    FRAME_FEATURE_NAMES,
    POSITION_CELL_FEATURE_NAMES,
    frameInputs,
    positionCellFeatures,
    threatCellFeatures,
} from './inputs';
import { duelOf, findDuel, integrity } from '../scoring/features';
import { readFrames } from '../scoring/recording';
import { scoreSnapshot } from '../scoring/score';

interface ManifestLine {
    path: string;
    map: string;
    seed: number | null;
    stations?: Record<string, { policy: string }>;
    outcome?: { scenario?: string } | null;
}

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const HORIZONS = [5, 10] as const;
const WINDOW = 10;
const ARRIVAL_HORIZON = 60;
const CELLS_EVERY = 2;
const ISO_DTS = [2, 5, 10, 20, 30, 45, 60];

const cell = (v: string | number | null | undefined) =>
    v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v);

class Csv {
    readonly hash = crypto.createHash('sha256');
    rows = 0;
    constructor(
        readonly file: string,
        header: string[],
    ) {
        fs.writeFileSync(file, '');
        this.write(header);
        this.rows = 0;
    }
    write(cells: (string | number | null | undefined)[]) {
        const text = cells.map(cell).join(',') + '\n';
        this.hash.update(text);
        fs.appendFileSync(this.file, text);
        this.rows++;
    }
}

async function readHits(file: string) {
    const hits: { t: number; id: string }[] = [];
    if (!fs.existsSync(file)) return undefined;
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }) });
    for await (const line of rl) {
        if (!line.includes('"blast_hit"')) continue;
        const e = JSON.parse(line) as { t: number; objectId: string };
        hits.push({ t: e.t, id: e.objectId });
    }
    return hits;
}

const META = ['run_id', 'map', 'scenario', 'seed', 'policy', 't'];

async function run(day: string, archive: string, line: ManifestLine, out: Record<'threat' | 'cells' | 'iso', Csv>) {
    const file = path.join(archive, day, line.path);
    const frames = await readFrames(file);
    const hits = await readHits(file.replace(/\.sgr$/, '.events.jsonl'));
    const policies = new Set(Object.values(line.stations ?? {}).map((s) => s.policy));
    const policy = policies.has('jev') ? 'jev' : policies.size === 1 ? [...policies][0] : 'mixed';
    const scenario = line.outcome?.scenario ?? path.basename(line.path).replace(/_seed\d+\.sgr$|\.sgr$/, '');
    const endT = frames[frames.length - 1]?.t ?? 0;
    const frameAt = (t: number) => {
        const i = frames.findIndex((f) => f.t >= t - 1e-3);
        return i >= 0 && Math.abs(frames[i].t - t) < 0.6 ? i : -1;
    };
    const values = new Map<string, number>();
    let nextCells = 0;
    for (let i = 0; i < frames.length; i++) {
        const { t, saved } = frames[i];
        const duel = findDuel(saved);
        if (!duel) continue;
        const playerId = duel.player.id;
        const targetId = duel.target.id;
        const meta = [`${day}/${line.path}`, line.map, scenario, line.seed, policy, t];
        const f = frameInputs(duel);

        // threat
        const labels = HORIZONS.map((h) => {
            const j = frameAt(t + h);
            const later = j >= 0 ? duelOf(frames[j].saved, playerId, targetId) : undefined;
            return later ? cellIndex(cellOf(f.mover, later.targetBody.position)) : null;
        });
        const drift = HORIZONS.flatMap((h) => {
            const cf = threatCellFeatures(duel, f, h);
            return [cf.findIndex((c) => c[1] === 1), ...cf.map((c) => c[2])];
        });
        out.threat.write([...meta, ...f.frame, f.current, ...drift, ...labels]);

        // isochrone validation: own position dt seconds later
        for (const dt of ISO_DTS) {
            const j = frameAt(t + dt);
            const later = j >= 0 ? frames[j].saved.fragment.space.getShip(playerId) : undefined;
            if (later) out.iso.write([...meta, dt, timeToReach(f.mover, later.position)]);
        }

        // positions: first entry into each cell
        if (t + 1e-6 < nextCells) continue;
        nextCells = t + CELLS_EVERY;
        const position = positionCellFeatures(duel, f);
        const entered = new Map<number, number>();
        for (let j = i + 1; j < frames.length && frames[j].t <= t + ARRIVAL_HORIZON + 1e-6; j++) {
            const body = frames[j].saved.fragment.space.getShip(playerId);
            if (!body || body.destroyed) break;
            const c = cellIndex(cellOf(f.mover, body.position));
            if (!entered.has(c)) entered.set(c, j);
        }
        for (const [c, j] of entered) {
            const k = frames[j].t;
            const at = duelOf(frames[j].saved, playerId, targetId);
            if (!at) continue; // target already gone on entry
            const done = endT >= k + WINDOW - 1e-6;
            const fire = hits
                ? hits.some((h) => h.id === targetId && h.t > k && h.t <= k + WINDOW)
                    ? 1
                    : done
                      ? 0
                      : null
                : null;
            const jEnd = frameAt(k + WINDOW);
            const endShip = jEnd >= 0 ? frames[jEnd].saved.fragment.ship.get(playerId) : undefined;
            const playerGone = jEnd >= 0 && !frames[jEnd].saved.fragment.space.getShip(playerId);
            const hit = hits?.some((h) => h.id === playerId && h.t > k && h.t <= k + WINDOW) ?? false;
            const drop = endShip && !playerGone ? integrity(at.player) - integrity(endShip) : playerGone ? 1 : null;
            const danger = hit || (drop !== null && drop > 1e-3) ? 1 : drop === null ? null : 0;
            let value: number | null = null;
            if (jEnd >= 0) {
                const key = `${jEnd}`;
                if (!values.has(key)) {
                    const s = frames[jEnd].saved;
                    const targetGone = !duelOf(s, playerId, targetId);
                    values.set(
                        key,
                        playerGone ? 0 : targetGone ? 1 : (scoreSnapshot(s, playerId)?.overall.value ?? Number.NaN),
                    );
                }
                value = values.get(key)!;
            }
            out.cells.write([...meta, ...f.frame, c, k - t, ...position[c], fire, danger, value]);
        }
    }
}

async function main() {
    const archive = path.resolve(arg('archive') ?? path.join(__dirname, '../../../../../training-archive'));
    const days = (
        arg('days')?.split(',') ?? fs.readdirSync(archive).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    ).sort();
    const limit = Number(arg('limit') ?? Infinity);
    const base = path.join(archive, 'datasets', `heatmap-${days.join('_')}`);
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const driftCols = (h: number) => [
        `drift_cell_${h}`,
        ...Array.from({ length: CELLS }, (_, c) => `drift_km_${h}_${c}`),
    ];
    const out = {
        threat: new Csv(`${base}-threat.csv`, [
            ...META,
            ...FRAME_FEATURE_NAMES,
            'current',
            ...HORIZONS.flatMap(driftCols),
            ...HORIZONS.map((h) => `cell${h}`),
        ]),
        cells: new Csv(`${base}-cells.csv`, [
            ...META,
            ...FRAME_FEATURE_NAMES,
            'cell',
            'arrive',
            ...POSITION_CELL_FEATURE_NAMES,
            'fire',
            'danger',
            'value',
        ]),
        iso: new Csv(`${base}-iso.csv`, [...META, 'dt', 'pred']),
    };
    let runs = 0;
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
                await run(day, archive, line, out);
                runs++;
                if (runs % 50 === 0) process.stderr.write(`${runs} runs\n`);
            } catch (err) {
                skipped.push(`${day}/${line.path}: ${(err as Error).message}`);
            }
        }
    }
    const manifest = {
        days,
        runs,
        skipped,
        frameFeatures: FRAME_FEATURE_NAMES,
        files: Object.fromEntries(
            Object.entries(out).map(([k, csv]) => [
                k,
                { file: path.basename(csv.file), rows: csv.rows, sha256: csv.hash.digest('hex') },
            ]),
        ),
    };
    fs.writeFileSync(`${base}.manifest.json`, JSON.stringify(manifest, null, 2));
    process.stdout.write(`${base}: ${runs} runs, ${skipped.length} skipped\n`);
}

void main();
