import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { IdleStrategy, Order, ShipModel, shipConfigurations } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../scenarios/training';
import { runTraining, trainingScenarios } from './training-scenarios';

import fc from 'fast-check';

/** A rung's target two ticks into its seed-1 layout: the space manager takes the map's orders on the first, the ship on the second. */
function targetOf(scenarioName: string) {
    const scenario = trainingScenarios[scenarioName];
    const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), 1);
    game.tick(1 / SERVER_TICK_HZ);
    game.tick(1 / SERVER_TICK_HZ);
    const ship = game.api.getShip(TRAINING_TARGET_ID);
    const object = game.spaceManager.state.getShip(TRAINING_TARGET_ID);
    if (!ship || !object) {
        throw new Error(`${scenarioName}: no target`);
    }
    return { state: ship.state, model: object.model };
}

describe('training ladder', () => {
    it('has the rungs T0, T1, T1-MK2, T1-predator and T1-noweave', () => {
        expect(Object.keys(trainingScenarios)).toEqual(['T0', 'T1', 'T1-MK2', 'T1-predator', 'T1-noweave']);
    });

    it('T0: a dragonfly-MK1 that plays dead, capped to the GVTS top speed', () => {
        const { state, model } = targetOf('T0');
        const cap = shipConfigurations.gravitas.smartPilot.maxSpeed;

        expect(model).toBe('dragonfly-MK1');
        expect(state.idleStrategy).toBe(IdleStrategy.PLAY_DEAD);
        expect(state.order).toBe(Order.NONE);
        expect(state.smartPilot.design.maxSpeed).toBe(cap);
        expect(state.smartPilot.design.maxSpeedFromAfterBurner).toBe(cap);
    });

    it.each<[string, ShipModel, boolean]>([
        ['T1', 'dragonfly-MK1', false],
        ['T1-MK2', 'dragonfly-MK2', false],
        ['T1-predator', 'predator', false],
        ['T1-noweave', 'dragonfly-MK1', true],
    ])('%s: a %s attacking the GVTS, no combat weave: %s', (scenarioName, expectedModel, noCombatWeave) => {
        const { state, model } = targetOf(scenarioName);

        expect(model).toBe(expectedModel);
        expect(state.order).toBe(Order.ATTACK);
        expect(state.orderTargetId).toBe(TRAINING_PLAYER_ID);
        expect(state.labNoCombatWeave ?? false).toBe(noCombatWeave);
    });
});

describe('runTraining', () => {
    jest.setTimeout(30_000);

    it('measures a T0 run that times out before the kill', () => {
        const result = runTraining(trainingScenarios.T0, { seed: 1, timeoutSeconds: 5 });

        expect(result).toMatchObject({ scenario: 'T0', seed: 1, killed: false, targetHealth: 1 });
        expect(result.seconds).toBeCloseTo(5, 1);
        expect(result.meanDistance).toBeGreaterThan(0);
        expect(result.inRangeFraction).toBeGreaterThanOrEqual(0);
        expect(result.inRangeFraction).toBeLessThanOrEqual(1);
        expect(result.killZoneFraction).toBeGreaterThanOrEqual(0);
        expect(result.killZoneFraction).toBeLessThanOrEqual(1);
    });
});
