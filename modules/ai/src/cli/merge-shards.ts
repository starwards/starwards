/**
 * Merges the shard outputs of a sharded `train` or `branch corpus` run (one shard per pod of a
 * Kubernetes Indexed Job, see deploy/k3s/training) into one run folder, as one host run would write it.
 * Shards stamped with different `runtime.json` (node version, commit) are refused.
 *
 *   merge-shards --shards <dir> --scenario <rung> --runs-out <dir> [--corpus-out <dir>]
 *
 * `<shards>/shard-<i>/runs` holds a `train --out` folder each; `<shards>/shard-<i>/corpus` a
 * `branch corpus --out` folder each. Recordings are copied under `--runs-out`, the run report
 * (`<scenario>-crews.md/json`) is rebuilt over every seed, recording paths point at the copies; the
 * branch rows are concatenated into `--corpus-out` with `corpus.md` and `mine.md` rebuilt.
 */
import { BranchRow, corpusTable } from '../branching/corpus';
import { mine, mineReport } from '../branching/mine';

import { CrewRunResult } from '../training/train-crew';
import { crewReport } from '../training/report';
import fs from 'node:fs';
import path from 'node:path';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function required(name: string) {
    const value = arg(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
}

const shardsDir = path.resolve(required('shards'));
const scenario = required('scenario');
const runsOut = path.resolve(required('runs-out'));
const corpusOut = arg('corpus-out') && path.resolve(arg('corpus-out')!);
const shards = fs
    .readdirSync(shardsDir)
    .filter((d) => /^shard-\d+$/.test(d))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    .map((d) => path.join(shardsDir, d));
if (!shards.length) throw new Error(`no shard-<i> folders in ${shardsDir}`);

// a recording replays, and its branches fingerprint, only on the engine and code that made it
const runtimes = shards.map((shard) => {
    const file = path.join(shard, 'runtime.json');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : 'unstamped';
});
if (new Set(runtimes).size > 1) {
    const list = shards.map((s, i) => `${s}: ${runtimes[i]}`).join('\n');
    throw new Error(`shards ran on different runtimes, not merged:\n${list}`);
}

const results: CrewRunResult[] = [];
const headers: string[] = [];
for (const shard of shards) {
    const runs = path.join(shard, 'runs');
    const report = path.join(runs, `${scenario}-crews.json`);
    if (!fs.existsSync(report)) throw new Error(`${report} missing: that shard did not finish`);
    for (const r of JSON.parse(fs.readFileSync(report, 'utf8')) as CrewRunResult[]) {
        if (r.recording) {
            // the recording and its sidecars (`<stem>.events.jsonl`); not the `.sgr.duckdb` query cache
            const stem = path.basename(r.recording).replace(/\.sgr$/, '');
            fs.mkdirSync(path.join(runsOut, r.crew), { recursive: true });
            for (const file of fs.readdirSync(path.join(runs, r.crew))) {
                if (file.startsWith(`${stem}.`) && !file.includes('.duckdb')) {
                    fs.copyFileSync(path.join(runs, r.crew, file), path.join(runsOut, r.crew, file));
                }
            }
            results.push({ ...r, recording: path.join(runsOut, r.crew, path.basename(r.recording)) });
        } else {
            results.push(r);
        }
    }
    const md = fs.readFileSync(path.join(runs, `${scenario}-crews.md`), 'utf8').split('\n');
    headers.push(`${path.basename(shard)}: ${md.find((l) => l.startsWith('seeds ')) ?? '?'}`);
}
// the report pairs every crew with the first one named, as `train` does
const baseline = results[0]?.crew;
results.sort((a, b) => a.seed - b.seed || a.crew.localeCompare(b.crew));
const seeds = [...new Set(results.map((r) => r.seed))];
const header = `merged ${shards.length} shard(s), ${seeds.length} seeds (${Math.min(...seeds)}–${Math.max(...seeds)})\n\n${headers.map((h) => `- ${h}`).join('\n')}`;
fs.mkdirSync(runsOut, { recursive: true });
fs.writeFileSync(path.join(runsOut, 'runtime.json'), `${runtimes[0]}\n`);
fs.writeFileSync(path.join(runsOut, `${scenario}-crews.md`), crewReport(scenario, results, header, baseline));
fs.writeFileSync(path.join(runsOut, `${scenario}-crews.json`), JSON.stringify(results, null, 2));
process.stdout.write(`runs: ${results.length} → ${runsOut}\n`);

if (corpusOut) {
    const rows: BranchRow[] = shards.flatMap((shard) => {
        const file = path.join(shard, 'corpus', 'branches.jsonl');
        if (!fs.existsSync(file)) throw new Error(`${file} missing: that shard did not finish`);
        return fs
            .readFileSync(file, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as BranchRow);
    });
    rows.sort((a, b) => a.seed - b.seed || a.t - b.t || a.alternative.localeCompare(b.alternative));
    const diverged = rows.filter((r) => !r.prefixMatches).length;
    const corpusHeader = `${scenario}, ${seeds.length} runs, ${rows.length} branches (${diverged} diverged), merged from ${shards.length} shard(s)`;
    fs.mkdirSync(corpusOut, { recursive: true });
    fs.writeFileSync(path.join(corpusOut, 'runtime.json'), `${runtimes[0]}\n`);
    fs.writeFileSync(path.join(corpusOut, 'branches.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(corpusOut, 'corpus.md'), corpusTable(rows, corpusHeader));
    fs.writeFileSync(path.join(corpusOut, 'mine.md'), `${corpusHeader}\n\n${mineReport(rows, mine(rows))}`);
    process.stdout.write(`branches: ${rows.length} (${diverged} diverged) → ${corpusOut}\n`);
    if (diverged) process.exitCode = 1;
}
