// Rewrites scripts/ci-shard-weights.json from the junit reports of a CI run.
// Usage: gh run download <run id> -D <dir> -p 'playwright-results-*' -p 'unit-test-results-*'
//        node scripts/ci-shard-weights.mjs <dir>
// Playwright reports one <testsuite> per file; jest-junit tags each <testcase> with file="..."
// (JEST_JUNIT_ADD_FILE_ATTRIBUTE in ci-cd.yml). A kind with no data keeps its old weights.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir] = process.argv.slice(2);
if (!dir) {
    process.stderr.write('usage: node scripts/ci-shard-weights.mjs <junit dir>\n');
    process.exit(2);
}
const root = process.cwd();
const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.xml') ? [join(d, e.name)] : [],
    );
// jest-junit writes the CI runner's absolute path; every test file lives under modules/
const toRepoPath = (f) =>
    f
        .split('\\')
        .join('/')
        .replace(/^.*?(?=modules\/)/, '');
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

const seconds = { unit: {}, e2e: {} };
const add = (kind, file, time) => (seconds[kind][file] = (seconds[kind][file] ?? 0) + time);
for (const xml of walk(dir).map((f) => readFileSync(f, 'utf8'))) {
    for (const [tag] of xml.matchAll(/<testsuite\s[^>]*>/g)) {
        const name = attr(tag, 'name');
        if (name?.endsWith('.spec.ts')) add('e2e', toRepoPath(name), Number(attr(tag, 'time')));
    }
    for (const [tag] of xml.matchAll(/<testcase\s[^>]*>/g)) {
        const file = attr(tag, 'file');
        if (file) add('unit', toRepoPath(file), Number(attr(tag, 'time')));
    }
}

const path = join(root, 'scripts/ci-shard-weights.json');
const weights = JSON.parse(readFileSync(path, 'utf8'));
for (const kind of ['unit', 'e2e']) {
    const entries = Object.entries(seconds[kind]);
    if (entries.length === 0) continue;
    weights[kind] = Object.fromEntries(
        entries.sort(([, a], [, b]) => b - a).map(([f, s]) => [f, Math.max(1, Math.round(s))]),
    );
    process.stderr.write(`${kind}: ${entries.length} files\n`);
}
weights['//'] =
    `Seconds per test file, measured in CI (${new Date().toISOString().slice(0, 10)}) by scripts/ci-shard-weights.mjs. Only shard balance depends on these; a missing file gets the default weight.`;
writeFileSync(path, `${JSON.stringify(weights, null, 4)}\n`);
