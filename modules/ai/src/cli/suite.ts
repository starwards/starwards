/**
 * Plays the curriculum's levels for a crew and compares every result with a stored baseline, so a
 * candidate is accepted only if it holds on every earlier level and benchmark.
 *
 *   npm run suite -- --crew crews/reference.json [--levels L0,L1] [--baseline <name>] [--save-baseline] [--workers 2] [--out <dir>] [--archive]
 *
 * `--baseline` defaults to the crew's name (`curriculum/baselines/<name>.json`); `--save-baseline`
 * writes this run's levels into it. `--archive` copies the run into the training archive and
 * rebuilds that day's manifest. Exits 1 when anything regressed. `--no-cache` and `--cache-dir <dir>`
 * reach every run it starts.
 */
import { CURRICULUM_DIR, loadLadder } from '../suite/ladder';
import { LevelResult, Verdict, compareLevel, levelAccepted } from '../suite/regression';

import { applyCacheFlags } from '../brain/jev-cache';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCrewFile } from '../crew/crew-config';
import { runLevel } from '../suite/run-suite';

type Baseline = { name: string; crew: string; commit: string; date: string; levels: LevelResult[] };

/** The training archive sits beside the repo checkouts in the workspace folder. */
const ARCHIVE_DIR = path.resolve(__dirname, '../../../../../training-archive');

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const fmt = (n: number | null, digits = 1) => (n === null ? '–' : n.toFixed(digits));

function report(
    crew: string,
    baselineName: string,
    rows: { result: LevelResult; verdicts: Verdict[]; accepted: boolean }[],
) {
    const lines = [
        `# Suite: ${crew}`,
        '',
        `baseline \`${baselineName}\``,
        '',
        '| level | item | seeds | result | refused | fallbacks | level accepted | vs baseline | detail |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const { result, verdicts, accepted } of rows) {
        for (const [i, item] of result.items.entries()) {
            const outcome =
                item.kind === 'rung'
                    ? `kills ${item.kills}/${item.runs}, median ${fmt(item.medianSeconds)} s`
                    : `score ${item.meanScore.toFixed(3)} ± ${item.sdScore.toFixed(3)} (${item.brain})`;
            lines.push(
                `| ${result.id} | ${item.name} | ${result.seeds.first}–${result.seeds.first + result.seeds.count - 1} | ${outcome} | ${item.refused} | ${item.fallbacks} | ${accepted ? 'yes' : 'no'} | ${verdicts[i].status} | ${verdicts[i].detail} |`,
            );
        }
    }
    return lines.join('\n') + '\n';
}

function archive(outDir: string, crew: string) {
    const date = new Date().toISOString().slice(0, 10);
    const runName = `${crew}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
    const target = path.join(ARCHIVE_DIR, date, 'suite', runName);
    fs.cpSync(outDir, target, { recursive: true });
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync('python', [path.join(ARCHIVE_DIR, 'build_manifest.py'), date, commit], { stdio: 'inherit' });
    return target;
}

async function main() {
    applyCacheFlags();
    const crewPath = path.resolve(arg('crew', ''));
    if (!fs.existsSync(crewPath)) {
        throw new Error('usage: suite --crew <crew.json> [--levels L0,L1] [--baseline <name>] [--save-baseline]');
    }
    const crew = readCrewFile(crewPath).name;
    const ladder = loadLadder();
    const wanted = arg('levels', '').split(',').filter(Boolean);
    const unknown = wanted.filter((id) => !ladder.levels.some((l) => l.id === id));
    if (unknown.length) {
        throw new Error(`unknown levels ${unknown.join(', ')}`);
    }
    const levels = ladder.levels.filter((l) => l.status === 'built' && (!wanted.length || wanted.includes(l.id)));
    const baselineName = arg('baseline', crew);
    const baselinePath = path.join(CURRICULUM_DIR, 'baselines', `${baselineName}.json`);
    const baseline = fs.existsSync(baselinePath)
        ? (JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as Baseline)
        : undefined;
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-suite', crew)));
    const workers = Number(arg('workers', '1'));

    const rows = [];
    for (const level of levels) {
        process.stdout.write(`${level.id}: ${[...level.rungs, ...level.benchmarks].join(', ')}\n`);
        const result = await runLevel(level, { crewPath, outDir, workers });
        const verdicts = compareLevel(
            baseline?.levels.find((l) => l.id === level.id),
            result,
            ladder.regression,
        );
        rows.push({ result, verdicts, accepted: levelAccepted(level, result) });
    }
    const text = report(crew, baselineName, rows);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'suite.md'), text);
    fs.writeFileSync(path.join(outDir, 'suite.json'), JSON.stringify(rows, null, 2));
    process.stdout.write(`${text}\nreport: ${path.join(outDir, 'suite.md')}\n`);

    if (process.argv.includes('--save-baseline')) {
        const ran = rows.map((r) => r.result);
        const saved: Baseline = {
            name: baselineName,
            crew,
            commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
            date: new Date().toISOString().slice(0, 10),
            levels: [...(baseline?.levels.filter((l) => !ran.some((r) => r.id === l.id)) ?? []), ...ran].sort((a, b) =>
                a.id.localeCompare(b.id),
            ),
        };
        fs.writeFileSync(baselinePath, JSON.stringify(saved, null, 4) + '\n');
        process.stdout.write(`baseline: ${baselinePath}\n`);
    }
    if (process.argv.includes('--archive')) {
        process.stdout.write(`archived: ${archive(outDir, crew)}\n`);
    }
    if (rows.some((r) => r.verdicts.some((v) => v.status === 'regressed'))) {
        process.exitCode = 1;
    }
}

void main();
