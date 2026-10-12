/**
 * Plays the weapons-validation crews (`crews/weapons-<policy>.json`) on matched seeds, and writes each run's outcome to
 * `<out>/<crew>/<scenario>_seed<N>.result.json` beside its recording. Scripted seats only: no Jev.
 *
 *   npm --prefix modules/ai run score:weapons-runs -- --scenario T1 --seeds 12 --out <dir> [--first-seed 1]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '@starwards/server/src/scenarios/training';
import { captain } from './captain';
import { runCrewTraining } from '../training/train-crew';

export const WEAPONS_CREWS = ['reference', 'idle', 'spray-fire', 'wrong-ammo', 'no-lock', 'torpedo-reference'] as const;

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

/**
 * Scripted actors outside the consoles: on W-multi, a captain designating the threat for every crew
 * but no-lock (whose flaw is clearing the lock). The torpedo-using crew differs from the reference
 * only by its engineer powering the tubes: the reference weapons launches through the console.
 */
function scriptFor(scenario: string, crew: string) {
    return scenario === 'W-multi' && crew !== 'no-lock' ? captain(TRAINING_PLAYER_ID, TRAINING_TARGET_ID) : undefined;
}

async function main() {
    const scenario = arg('scenario', 'T1');
    const seeds = Number(arg('seeds', '12'));
    const first = Number(arg('first-seed', '1'));
    const outDir = path.resolve(arg('out', 'weapons-runs'));
    const only = arg('crews', WEAPONS_CREWS.join(',')).split(',');
    for (let seed = first; seed < first + seeds; seed++) {
        for (const crew of only) {
            const result = await runCrewTraining(path.resolve(__dirname, `../../crews/weapons-${crew}.json`), {
                scenario,
                seed,
                timeoutSeconds: Number(arg('timeout', '300')),
                latencySeconds: 0.2,
                intervalSimSeconds: 1,
                outDir,
                script: scriptFor(scenario, crew),
            });
            const { killed, seconds } = result;
            fs.writeFileSync(
                path.join(outDir, `weapons-${crew}`, `${scenario}_seed${seed}.result.json`),
                JSON.stringify({ crew, scenario, seed, killed, seconds }),
            );
            process.stdout.write(`${scenario} seed ${seed} ${crew}: killed ${killed} at ${seconds.toFixed(0)} s\n`);
        }
    }
}

if (require.main === module) void main();
