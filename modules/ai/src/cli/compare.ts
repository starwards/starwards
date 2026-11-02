/**
 * Pairs crews seed by seed from finished `train` runs, without playing anything: for each crew
 * against the baseline, the mean difference in run value, kills, seconds and station scores with
 * its 95% interval and sign test, on the seeds both played.
 *
 *   npm run compare -- --results <out>/T0-crews.json [--results <other out>/T0-crews.json] [--baseline <crew>] [--timeout 120]
 *
 * `--baseline` defaults to the first crew of the first file. A crew named in two files is told apart
 * by its run folder. `--timeout <s>` rescores every run from its recording over that many seconds
 * (a kill after it does not count), which is how runs played with different timeouts, or recorded
 * before results carried a run score, are compared; recordings are looked up beside the results file.
 */
import { readEvents, readFrames } from '../scoring/recording';
import { CrewRunResult } from '../training/train-crew';
import fs from 'node:fs';
import { pairedSection } from '../training/report';
import path from 'node:path';
import { scoreFrames } from '../scoring/run-score';

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

/** A run as it would have ended had the rung timed out at `horizon`. */
async function within(run: CrewRunResult, recording: string, horizon: number): Promise<CrewRunResult> {
    const killed = run.killed && run.seconds <= horizon;
    const seconds = Math.min(run.seconds, horizon);
    const frames = (await readFrames(recording)).filter((f) => f.t < horizon);
    const score = scoreFrames(
        frames,
        { killed, seconds, timeoutSeconds: horizon },
        readEvents(recording).filter((e) => e.t < horizon),
    );
    return { ...run, killed, seconds, timeoutSeconds: horizon, score: score ?? null };
}

async function main() {
    const files = args('results').map((f) => path.resolve(f));
    if (!files.length) {
        throw new Error(
            'usage: compare --results <scenario>-crews.json [--results ...] [--baseline <crew>] [--timeout <s>]',
        );
    }
    const [horizon] = args('timeout').map(Number);
    const loaded = files.map((file) => ({ file, runs: JSON.parse(fs.readFileSync(file, 'utf8')) as CrewRunResult[] }));
    const timesNamed = (crew: string) => loaded.filter(({ runs }) => runs.some((r) => r.crew === crew)).length;
    const results: CrewRunResult[] = [];
    for (const { file, runs } of loaded) {
        const dir = path.dirname(file);
        for (const run of runs) {
            const crew = timesNamed(run.crew) > 1 ? `${run.crew} (${path.basename(dir)})` : run.crew;
            const recording = path.join(dir, run.crew, `${run.scenario}_seed${run.seed}.sgr`);
            if (horizon === undefined && run.score === undefined) {
                throw new Error(`${file} carries no run scores: name the rung's --timeout to score its recordings`);
            }
            results.push({ ...(horizon === undefined ? run : await within(run, recording, horizon)), crew });
        }
    }
    const timeouts = new Set(results.map((r) => r.timeoutSeconds));
    if (timeouts.size > 1) {
        throw new Error(`runs played timeouts ${[...timeouts].join(', ')} s: name a common --timeout`);
    }
    const [baseline = results[0].crew] = args('baseline');
    if (!results.some((r) => r.crew === baseline)) {
        throw new Error(`no crew ${baseline}; one of ${[...new Set(results.map((r) => r.crew))].join(', ')}`);
    }
    process.stdout.write(pairedSection(results, baseline).join('\n') + '\n');
}

void main();
