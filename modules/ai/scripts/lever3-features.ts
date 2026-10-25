/**
 * Fork-state features for lever3-gate1.py: one JSON line per (seed, t) present in a sweep's sweep.jsonl,
 * using sweep-features' `features()` on the seed's default-run recording.
 *   node -r ts-node/register/transpile-only scripts/lever3-features.ts <sweep out dir> > features.jsonl
 */
import { features } from '../src/cli/sweep-features';
import fs from 'node:fs';
import path from 'node:path';
import { readRunLog } from '../src/branching/run-log';

const dir = process.argv[2] ?? process.env.SWEEP_DIR!;
const states = new Map<number, Set<number>>();
for (const l of fs.readFileSync(path.join(dir, 'sweep.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l) as { seed: number; t: number };
    states.set(r.seed, (states.get(r.seed) ?? new Set()).add(r.t));
}
for (const [seed, ts] of states) {
    const runDir = path.join(dir, 'runs', `seed${seed}`);
    const rec = fs.readdirSync(runDir, { recursive: true, encoding: 'utf8' }).find((f) => f.endsWith('.sgr'));
    if (!rec) continue;
    const log = readRunLog(path.join(runDir, rec));
    for (const t of ts) process.stdout.write(JSON.stringify({ seed, t, ...features(log, t) }) + '\n');
}
