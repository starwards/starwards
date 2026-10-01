/**
 * Plays a training rung with one or more crews of station brains on the same seeds, records every
 * run with its decisions, and prints a markdown comparison.
 *
 *   npm --prefix modules/ai run train -- --scenario T0 --seeds 8 --crew crews/reference.json --crew crews/jev.json
 *
 * Recordings land in `<out>/<crew>/<scenario>_seed<N>.sgr` with the decisions in the `.events.jsonl`
 * beside them; the report in `<out>/<scenario>-crews.md`. Seeds are shared round-robin between
 * `--workers` processes; a Jev crew's request budget is split between them.
 */
import { CrewRunResult, runCrewTraining } from '../training/train-crew';

import { crewReport } from '../training/report';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Job = { crews: string[]; seeds: number[]; options: Omit<Parameters<typeof runCrewTraining>[1], 'seed'> };

/** Account-wide request budget of `jev-1.13.0`, per minute, with headroom for retries. */
const JEV_REQUESTS_PER_MINUTE = 1000;

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function runJob(job: Job) {
    const results: CrewRunResult[] = [];
    for (const seed of job.seeds) {
        for (const crew of job.crews) {
            results.push(await runCrewTraining(crew, { ...job.options, seed }));
        }
    }
    return results;
}

if (process.send) {
    process.once('message', (job: Job) => {
        void runJob(job).then((results) => process.send?.(results, () => process.exit(0)));
    });
} else {
    void main();
}

async function main() {
    const scenario = arg('scenario', 'T0');
    const crews = args('crew').map((c) => path.resolve(c));
    if (!crews.length) {
        throw new Error('name at least one crew file with --crew <path>');
    }
    const seedCount = Number(arg('seeds', '8'));
    const firstSeed = Number(arg('first-seed', '1'));
    const workers = Math.max(1, Math.min(Number(arg('workers', '1')), seedCount));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-crew-training')));
    const options: Job['options'] = {
        scenario,
        timeoutSeconds: Number(arg('timeout', '300')),
        latencySeconds: Number(arg('latency', '0.2')),
        intervalSimSeconds: Number(arg('interval', '1')),
        outDir,
        jevRequestsPerMinute: JEV_REQUESTS_PER_MINUTE / workers,
    };
    const shards: number[][] = Array.from({ length: workers }, () => []);
    for (let i = 0; i < seedCount; i++) {
        shards[i % workers].push(firstSeed + i);
    }
    const started = Date.now();
    const results =
        workers === 1
            ? await runJob({ crews, seeds: shards[0], options })
            : (
                  await Promise.all(
                      shards.map(
                          (seeds) =>
                              new Promise<CrewRunResult[]>((resolve, reject) => {
                                  const child = fork(__filename, [], { execArgv: process.execArgv });
                                  child.once('message', (r) => resolve(r as CrewRunResult[]));
                                  child.once('error', reject);
                                  child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                                  child.send({ crews, seeds, options } satisfies Job);
                              }),
                      ),
                  )
              ).flat();
    results.sort((a, b) => a.seed - b.seed || a.crew.localeCompare(b.crew));
    const header = `seeds ${firstSeed}–${firstSeed + seedCount - 1}, timeout ${options.timeoutSeconds} s, latency ${options.latencySeconds} s, ${workers} worker(s), wall ${((Date.now() - started) / 1000).toFixed(0)} s`;
    const report = crewReport(scenario, results, header);
    fs.mkdirSync(outDir, { recursive: true });
    const reportPath = path.join(outDir, `${scenario}-crews.md`);
    fs.writeFileSync(reportPath, report);
    fs.writeFileSync(path.join(outDir, `${scenario}-crews.json`), JSON.stringify(results, null, 2));
    process.stdout.write(`${report}\nreport: ${reportPath}\n`);
}
