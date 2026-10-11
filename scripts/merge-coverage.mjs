// Merges the coverage-final.json of each coverage-core shard, writes the reports, and enforces
// the same thresholds test:coverage:core passes to jest.
// Usage: node scripts/merge-coverage.mjs <shards dir> <output dir>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const [shardsDir, outDir] = process.argv.slice(2);
if (!shardsDir || !outDir) {
    process.stderr.write('usage: node scripts/merge-coverage.mjs <shards dir> <output dir>\n');
    process.exit(2);
}

// keep in sync with test:coverage:core in package.json
const thresholds = JSON.parse(
    /--coverageThreshold='([^']+)'/.exec(
        JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:coverage:core'],
    )[1],
)['./modules/core/src/'];

function findReports(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? findReports(path) : name === 'coverage-final.json' ? [path] : [];
    });
}
const files = findReports(shardsDir);
if (files.length === 0) {
    process.stderr.write(`no coverage-final.json under ${shardsDir}\n`);
    process.exit(1);
}
const map = libCoverage.createCoverageMap({});
for (const file of files) {
    map.merge(JSON.parse(readFileSync(file, 'utf8')));
}

const context = libReport.createContext({ dir: outDir, coverageMap: map });
for (const reporter of ['json', 'lcov', 'text-summary']) {
    reports.create(reporter).execute(context);
}

const summary = map.getCoverageSummary();
let failed = false;
for (const [metric, minimum] of Object.entries(thresholds)) {
    const actual = summary[metric].pct;
    if (actual < minimum) {
        failed = true;
        process.stderr.write(`coverage for ${metric} (${actual}%) does not meet threshold (${minimum}%)\n`);
    }
}
process.stdout.write(`merged ${files.length} shard reports, ${map.files().length} files\n`);
process.exit(failed ? 1 : 0);
