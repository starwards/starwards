// Deterministic weighted split of test files across CI shards (longest-processing-time first).
// Usage: node scripts/ci-shard.mjs <unit|e2e> <index 1-based> <total>
// Prints jest paths (use with --runTestsByPath) or anchored playwright file filters, one per line.
// Every shard computes the same split from the same inputs, so the shards are disjoint and complete.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const [kind, indexArg, totalArg] = process.argv.slice(2);
const index = Number(indexArg);
const total = Number(totalArg);
if (!['unit', 'e2e'].includes(kind) || !(index >= 1 && index <= total)) {
    console.error('usage: node scripts/ci-shard.mjs <unit|e2e> <index> <total>');
    process.exit(2);
}
const root = process.cwd();
const weights = JSON.parse(readFileSync(join(root, 'scripts/ci-shard-weights.json'), 'utf8'))[kind];
const DEFAULT_WEIGHT = kind === 'unit' ? 2 : 5;

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.spec.ts') ? [join(dir, e.name)] : [],
    );
}
const listed =
    kind === 'unit'
        ? execFileSync(process.execPath, ['node_modules/jest/bin/jest.js', '--listTests'], { encoding: 'utf8' })
              .split('\n')
              .filter(Boolean)
        : walk(join(root, 'modules/e2e'));
const files = listed.map((f) => relative(root, f).split(sep).join('/')).sort();
if (files.length === 0) {
    console.error(`no ${kind} test files found`);
    process.exit(1);
}

const weightOf = (f) => weights[f] ?? DEFAULT_WEIGHT;
const loads = Array.from({ length: total }, () => 0);
const assigned = Array.from({ length: total }, () => []);
for (const f of [...files].sort((a, b) => weightOf(b) - weightOf(a) || (a < b ? -1 : 1))) {
    const shard = loads.indexOf(Math.min(...loads));
    loads[shard] += weightOf(f);
    assigned[shard].push(f);
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
for (const f of assigned[index - 1]) {
    console.log(kind === 'unit' ? f : `/${escapeRegExp(f)}$/`);
}
console.error(`${kind} shard ${index}/${total}: ${assigned[index - 1].length} files, weight ${loads[index - 1]}`);
