import { ItemResult, LevelResult, summariseBench, summariseRung } from './regression';

import { BenchmarkRunResult } from '../benchmarks/run-benchmark';
import { CrewRunResult } from '../training/train-crew';
import { Level } from './ladder';
import fs from 'node:fs';
import { loadBenchmark } from '../benchmarks/benchmark';
import path from 'node:path';
import { readCrewFile } from '../crew/crew-config';
import { spawn } from 'node:child_process';

const MODULE_DIR = path.resolve(__dirname, '../..');

/** Runs one of the module's CLIs to completion in its own process, its output into `logPath`. */
function runCli(script: 'train' | 'bench', args: string[], logPath: string) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const log = fs.openSync(logPath, 'w');
    const child = spawn(
        process.execPath,
        [
            `--env-file-if-exists=${path.join(MODULE_DIR, '.env')}`,
            '-r',
            'ts-node/register/transpile-only',
            path.join(MODULE_DIR, 'src', 'cli', `${script}.ts`),
            ...args,
        ],
        { cwd: MODULE_DIR, stdio: ['ignore', log, log] },
    );
    return new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => {
            fs.closeSync(log);
            if (code) reject(new Error(`${script} ${args.join(' ')} exited ${code}; log: ${logPath}`));
            else resolve();
        });
    });
}

export type SuiteOptions = { crewPath: string; outDir: string; workers: number };

/**
 * Plays one level for a crew: every rung with the whole crew through `train`, every benchmark through
 * `bench` with the crew's own brain and policy at the benchmark's station. A benchmark for a station
 * the crew does not seat is skipped. Reports, recordings and sidecars stay under `<outDir>/<level>`.
 */
export async function runLevel(level: Level, { crewPath, outDir, workers }: SuiteOptions): Promise<LevelResult> {
    const crew = readCrewFile(crewPath);
    const levelDir = path.join(outDir, level.id);
    const seedArgs = [
        '--seeds',
        String(level.seeds.count),
        '--first-seed',
        String(level.seeds.first),
        '--workers',
        String(workers),
    ];
    const items: ItemResult[] = [];
    for (const scenario of level.rungs) {
        const dir = path.join(levelDir, scenario);
        await runCli(
            'train',
            [
                '--scenario',
                scenario,
                '--crew',
                crewPath,
                '--timeout',
                String(level.timeoutSeconds),
                '--out',
                dir,
                ...seedArgs,
            ],
            path.join(dir, 'train.log'),
        );
        const runs = JSON.parse(fs.readFileSync(path.join(dir, `${scenario}-crews.json`), 'utf8')) as CrewRunResult[];
        items.push(summariseRung(scenario, runs));
    }
    for (const bench of level.benchmarks) {
        const seat = crew.seats.find((s) => s.station === loadBenchmark(bench).station);
        if (!seat) continue;
        const dir = path.join(levelDir, bench);
        await runCli(
            'bench',
            ['--bench', bench, '--brain', seat.brainPath, '--policy', seat.policy, '--out', dir, ...seedArgs],
            path.join(dir, 'bench.log'),
        );
        const runs = JSON.parse(fs.readFileSync(path.join(dir, `${bench}.json`), 'utf8')) as BenchmarkRunResult[];
        items.push(summariseBench(bench, runs[0]?.brain ?? seat.policy, runs));
    }
    return { id: level.id, seeds: level.seeds, timeoutSeconds: level.timeoutSeconds, items };
}
