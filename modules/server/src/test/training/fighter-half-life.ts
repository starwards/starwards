import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { TRAINING_TARGET_ID } from '../../scenarios/training';
import fc from 'fast-check';
import { tapDerelicts } from '../damage-tap';
import { trainingScenarios } from './training-scenarios';

/**
 * Fighter half-life under standard fire: the sim-seconds by which half of a rung's seeds have killed
 * the fighter. Pinned while the capsule kills (ruling 2026-09-24), as the target the internal-damage
 * kill path must reproduce before the capsule is removed. Nothing here reads the capsule, so these
 * specs are the parity check for its removal.
 *
 * Pinned on seeds 1-64 at 60 Hz with a 300 s cap (the {@link timeToKill} loop, one fresh id
 * sequence per seed), which is the acceptance measurement. CI runs seeds 1-16: 16-seed blocks of
 * the pinning runs have half-lives from 0.7x to 1.45x the pin, hence the band.
 */
const TOLERANCE = 0.5;
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

/** Sim-seconds until the rung's target dies in combat, or `Infinity` if it lives past `capSeconds`. */
function timeToKill(scenarioName: string, seed: number, capSeconds: number): number {
    const scenario = trainingScenarios[scenarioName];
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), seed);
    let killed = false;
    tapDerelicts(game, (id) => (killed ||= id === TRAINING_TARGET_ID));
    while (!killed && game.seconds < capSeconds) {
        game.tick(1 / SERVER_TICK_HZ);
    }
    return killed ? game.seconds : Infinity;
}

/** The time by which half of `times` have happened (`Infinity`: never). */
function halfLife(times: number[]): number {
    return [...times].sort((a, b) => a - b)[Math.ceil(times.length / 2) - 1];
}

/** One spec file per rung, so jest runs the rungs on parallel workers. */
export function describeFighterHalfLife(scenarioName: string, pinnedSeconds: number) {
    describe('fighter half-life under standard fire', () => {
        it(
            `${scenarioName}: half of seeds 1-${SEEDS.length} kill within ±${TOLERANCE * 100}% of the pinned ${pinnedSeconds} s`,
            () => {
                const cap = pinnedSeconds * (1 + TOLERANCE);
                const floor = pinnedSeconds * (1 - TOLERANCE);
                const times = SEEDS.map((seed) => timeToKill(scenarioName, seed, cap));
                const measured = halfLife(times);
                const perSeed = times.map((t, i) => `${SEEDS[i]}:${t.toFixed(0)}`).join(' ');
                expect(
                    measured >= floor && measured <= cap
                        ? 'within band'
                        : `half-life ${measured} s outside [${floor}, ${cap}] (seed:seconds ${perSeed})`,
                ).toBe('within band');
            },
            20 * 60 * 1000,
        );
    });
}
