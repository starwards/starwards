import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { TRAINING_ALLY_ID, TRAINING_DECOY_ID } from '../../scenarios/training-weapons';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../scenarios/training';

import { XY } from '@starwards/core/internal';
import fc from 'fast-check';
import { trainingScenarios } from './training-scenarios';

const start = (name: string, seed: number) => {
    const scenario = trainingScenarios[name];
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    return HeadlessGame.start(scenario.createMap(params), seed, { crewedPlayer: true });
};
const distance = (game: HeadlessGame, a: string, b: string) =>
    XY.distance(game.spaceManager.state.get(a)!.position, game.spaceManager.state.get(b)!.position);

describe('weapons training rungs', () => {
    it('W-multi: a threat, a decoy that cannot shoot back, and an ally in the line of fire', () => {
        const game = start('W-multi', 1);
        const state = game.spaceManager.state;
        const gvts = state.getShip(TRAINING_PLAYER_ID)!;
        expect(state.getShip(TRAINING_ALLY_ID)!.faction).toBe(gvts.faction);
        expect(state.getShip(TRAINING_TARGET_ID)!.faction).not.toBe(gvts.faction);
        const decoy = game.shipManagers.get(TRAINING_DECOY_ID)!.state;
        expect(
            decoy.magazine.count_HiExpShell + decoy.magazine.count_ArmPenShell + decoy.magazine.count_FragShell,
        ).toBe(0);
        expect(distance(game, TRAINING_ALLY_ID, TRAINING_TARGET_ID)).toBeLessThan(700);
    });

    it('W-outranged: the target starts beyond the gun and runs at the GVTS top speed', () => {
        const game = start('W-outranged', 1);
        expect(distance(game, TRAINING_PLAYER_ID, TRAINING_TARGET_ID)).toBeGreaterThan(10_000);
        for (let i = 0; i < 30 * SERVER_TICK_HZ; i++) game.tick(1 / SERVER_TICK_HZ);
        const target = game.spaceManager.state.get(TRAINING_TARGET_ID)!;
        expect(XY.lengthOf(target.velocity)).toBeGreaterThan(400);
        expect(XY.lengthOf(target.velocity)).toBeLessThanOrEqual(451);
    });
});
