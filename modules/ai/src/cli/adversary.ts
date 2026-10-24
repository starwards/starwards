/**
 * The adversary rung (M4.65, S0 of the NPC AI design): the fixed reference crew plays one rung family
 * while only the raider's profile varies, and every raider is fingerprinted.
 *
 *   npm --prefix modules/ai run adversary -- --family A1 --seeds 16 --workers 4 --out <dir>
 *
 * `--family A1` is T1 with one raider, `AW` the wave rung with every raider varied. `--profile <name>`
 * (repeatable) picks profiles; default is every profile the family has. Prints the markdown report and
 * writes `<out>/<family>.md` and `<out>/<family>.json`; `--baseline <path>` also writes the JSON there
 * to be committed. Recordings go to `<out>/runs` and are deleted unless `--keep-recordings` is given.
 * `--interval <s>` is the recording frame interval (default 1, 5 for AW). Jobs (profile x seed) are shared round-robin between `--workers` processes.
 */
import {
    AdversaryBaseline,
    AdversaryRun,
    adversaryMarkdown,
    storedBinEdges,
    summariseProfiles,
} from '../adversary/report';
import { AdversaryFamily, adversaryFamilies, playAdversaryRun } from '../adversary/run';
import { adversaryProfiles, waveAdversaryProfiles } from '@starwards/server/src/scenarios/adversary-profile';

import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Job = {
    family: AdversaryFamily;
    crewPath: string;
    timeoutSeconds: number;
    intervalSimSeconds: number;
    outDir: string;
    runs: [string, number][];
};

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

async function runJob({ family, crewPath, timeoutSeconds, intervalSimSeconds, outDir, runs }: Job) {
    const results: AdversaryRun[] = [];
    for (const [profile, seed] of runs) {
        results.push(
            await playAdversaryRun({ crewPath, family, profile, seed, timeoutSeconds, intervalSimSeconds, outDir }),
        );
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
    const family = arg('family', 'A1') as AdversaryFamily;
    if (!(family in adversaryFamilies)) {
        throw new Error(`--family ${family}: one of ${Object.keys(adversaryFamilies).join(', ')}`);
    }
    const available = (family === 'AW' ? waveAdversaryProfiles : Object.values(adversaryProfiles)).map((p) => p.name);
    const profiles = args('profile').length ? args('profile') : available;
    for (const profile of profiles) {
        if (!available.includes(profile)) {
            throw new Error(`--profile ${profile}: ${family} has ${available.join(', ')}`);
        }
    }
    const seeds = Number(arg('seeds', '16'));
    const firstSeed = Number(arg('first-seed', '1'));
    const crewPath = path.resolve(arg('crew', 'crews/reference.json'));
    const timeoutSeconds = Number(arg('timeout', String(adversaryFamilies[family].timeoutSeconds)));
    const intervalSimSeconds = Number(arg('interval', family === 'AW' ? '5' : '1'));
    const out = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-adversary')));
    const outDir = path.join(out, 'runs');
    const jobs: [string, number][] = profiles.flatMap((profile) =>
        Array.from({ length: seeds }, (_, i): [string, number] => [profile, firstSeed + i]),
    );
    const workers = Math.max(1, Math.min(Number(arg('workers', '1')), jobs.length));
    const shards: [string, number][][] = Array.from({ length: workers }, () => []);
    jobs.forEach((job, i) => shards[i % workers].push(job));
    const base = { family, crewPath, timeoutSeconds, intervalSimSeconds, outDir };
    const runs =
        workers === 1
            ? await runJob({ ...base, runs: shards[0] })
            : (
                  await Promise.all(
                      shards.map(
                          (shard) =>
                              new Promise<AdversaryRun[]>((resolve, reject) => {
                                  const child = fork(__filename, [], { execArgv: process.execArgv });
                                  child.once('message', (r) => resolve(r as AdversaryRun[]));
                                  child.once('error', reject);
                                  child.once('exit', (code) => code && reject(new Error(`worker exit ${code}`)));
                                  child.send({ ...base, runs: shard } satisfies Job);
                              }),
                      ),
                  )
              ).flat();
    const baseline: AdversaryBaseline = {
        rung: family,
        crew: path.basename(crewPath, '.json'),
        firstSeed,
        seeds,
        timeoutSeconds,
        rangeBinEdges: storedBinEdges,
        profiles: summariseProfiles(
            profiles.flatMap((profile) => runs.filter((r) => r.profile === profile).sort((a, b) => a.seed - b.seed)),
        ),
    };
    const json = `${JSON.stringify(baseline, null, 2)}\n`;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${family}.json`), json);
    const markdown = adversaryMarkdown(baseline);
    fs.writeFileSync(path.join(out, `${family}.md`), markdown);
    const baselinePath = arg('baseline', '');
    if (baselinePath) {
        fs.mkdirSync(path.dirname(path.resolve(baselinePath)), { recursive: true });
        fs.writeFileSync(path.resolve(baselinePath), json);
    }
    if (!process.argv.includes('--keep-recordings')) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    process.stdout.write(`${markdown}\nreport: ${path.join(out, `${family}.md`)}\n`);
}
