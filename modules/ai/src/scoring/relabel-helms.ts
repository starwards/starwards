/**
 * Recomputes the `helms_score30` label alone for the runs of a snapshot dataset, so a change to the helms score
 * does not need the whole dataset rebuilt (`dataset.ts` also extracts features and the other labels).
 *
 *   npm --prefix modules/ai run score:helms-labels -- --days 2026-10-02,... [--exclude <prefix>,...] --out <labels.csv> [--archive <dir>]
 *
 * Writes `run_id,frame,helms_score30` for every frame the player ship is in, run ids and frame numbers as in the
 * dataset; `ml/train.py --relabel` replaces the dataset's column with it. A run's observations are cached beside its
 * recording as `<run>.hobs1.json`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { HelmsObservation, helmsComponents, helmsScore30, observeHelms } from './helms-kpi';
import { readEvents, readFrames } from './recording';
import { RecordingEventLine } from '@starwards/core/internal';

const PLAYER = 'GVTS';
const KINDS = new Set(['shot', 'blast_hit', 'damage']);

interface Observed {
    readonly frames: readonly number[];
    readonly observations: readonly HelmsObservation[];
    readonly events: readonly RecordingEventLine[];
}

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function observed(sgr: string): Promise<Observed> {
    const cache = sgr.replace(/\.sgr$/, '.hobs1.json');
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8')) as Observed;
    const frames: number[] = [];
    const observations: HelmsObservation[] = [];
    (await readFrames(sgr)).forEach((f, i) => {
        const o = observeHelms(f.t, f.saved, PLAYER);
        if (o) {
            frames.push(i);
            observations.push(o);
        }
    });
    const result = { frames, observations, events: readEvents(sgr).filter((e) => KINDS.has(e.kind)) };
    fs.writeFileSync(cache, JSON.stringify(result));
    return result;
}

async function main() {
    const archive = path.resolve(arg('archive') ?? path.join(__dirname, '../../../../../training-archive'));
    const days = (arg('days') ?? '').split(',').filter(Boolean).sort();
    const excluded = (arg('exclude') ?? '').split(',').filter(Boolean);
    const out = path.resolve(arg('out') ?? 'helms-labels.csv');
    fs.writeFileSync(out, 'run_id,frame,helms_score30\n');
    let runs = 0;
    for (const day of days) {
        const lines = fs
            .readFileSync(path.join(archive, day, 'manifest.jsonl'), 'utf8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as { path: string })
            .filter((l) => !excluded.some((p) => l.path.startsWith(p)))
            .sort((a, c) => (a.path < c.path ? -1 : 1));
        for (const line of lines) {
            const sgr = path.join(archive, day, line.path);
            try {
                const { frames, observations, events } = await observed(sgr);
                const labels = helmsScore30(helmsComponents(observations, events, PLAYER));
                const rows = frames.map((f, j) => `${day}/${line.path},${f},${labels[j] ?? ''}\n`);
                fs.appendFileSync(out, rows.join(''));
                runs++;
                if (runs % 100 === 0) process.stderr.write(`${runs} runs\n`);
            } catch (err) {
                process.stderr.write(`skipped ${day}/${line.path}: ${(err as Error).message}\n`);
            }
        }
    }
    process.stdout.write(`${out}: ${runs} runs\n`);
}

void main();
