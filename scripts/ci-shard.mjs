// Deterministic weighted split of test files across CI shards (longest-processing-time first).
// Usage: node scripts/ci-shard.mjs <unit|core|e2e|e2e-rest> <index 1-based> <total>
// `core` is the unit tests under modules/core (what test:coverage:core runs).
// `e2e-rest` is every e2e file except the visual gallery, which CI shards on its own by test.
// Prints jest paths (use with --runTestsByPath) or anchored playwright file filters, one per line.
// Every shard computes the same split from the same inputs, so the shards are disjoint and complete.
import { join, relative, sep } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [kind, indexArg, totalArg] = process.argv.slice(2);
const index = Number(indexArg);
const total = Number(totalArg);
if (!['unit', 'core', 'e2e', 'e2e-rest'].includes(kind) || !(index >= 1 && index <= total)) {
    process.stderr.write('usage: node scripts/ci-shard.mjs <unit|core|e2e|e2e-rest> <index> <total>\n');
    process.exit(2);
}
const GALLERY = 'modules/e2e/test/visual/gallery.spec.ts';
const root = process.cwd();
const isJest = kind === 'unit' || kind === 'core';
const weights = JSON.parse(readFileSync(join(root, 'scripts/ci-shard-weights.json'), 'utf8'))[isJest ? 'unit' : 'e2e'];
const DEFAULT_WEIGHT = isJest ? 2 : 5;

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
            ? e.name === 'node_modules'
                ? []
                : walk(join(dir, e.name))
            : e.name.endsWith('.spec.ts')
              ? [join(dir, e.name)]
              : [],
    );
}
const listed = isJest
    ? execFileSync(process.execPath, ['node_modules/jest/bin/jest.js', '--listTests'], { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean)
    : walk(join(root, 'modules/e2e'));
const files = listed
    .map((f) => relative(root, f).split(sep).join('/'))
    .filter((f) => kind !== 'core' || f.startsWith('modules/core/'))
    .filter((f) => kind !== 'e2e-rest' || f !== GALLERY)
    .sort();
if (files.length === 0) {
    process.stderr.write(`no ${kind} test files found\n`);
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
    process.stdout.write(`${isJest ? f : `/${escapeRegExp(f)}$/`}\n`);
}
process.stderr.write(
    `${kind} shard ${index}/${total}: ${assigned[index - 1].length} files, weight ${loads[index - 1]}\n`,
);
