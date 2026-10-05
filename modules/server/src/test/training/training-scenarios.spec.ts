import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    EVENTS_EXT,
    IdleStrategy,
    Order,
    ShipManagerPc,
    ShipModel,
    parseEventLine,
    shipConfigurations,
} from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../scenarios/training';
import { runTraining, trainingScenarios } from './training-scenarios';

import { RECORDING_EXT } from '../../recording/game-recorder';
import fc from 'fast-check';
import { rmDirRetrying } from './analysis/__fixtures__/rm-retry';

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
    it('has the rungs T0, T0-wide, T0-constrained, T1, T1-MK2, T1-predator, T1-noweave, E1-MK2, E1-predator, T1-lite, W-multi and W-outranged', () => {
        expect(Object.keys(trainingScenarios)).toEqual([
            'T0',
            'T0-wide',
            'T0-constrained',
            'T1',
            'T1-MK2',
            'T1-predator',
            'T1-noweave',
            'E1-MK2',
            'E1-predator',
            'T1-lite',
            'W-multi',
            'W-outranged',
        ]);
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
        expect(state.capsule.integrity).toBe(1);
    });

    it('T1-lite: a dragonfly-MK1 holding its ground, capped to the GVTS top speed, capsule 70% breached', () => {
        const { state, model } = targetOf('T1-lite');
        const cap = shipConfigurations.gravitas.smartPilot.maxSpeed;

        expect(model).toBe('dragonfly-MK1');
        expect(state.order).toBe(Order.NONE);
        expect(state.idleStrategy).toBe(IdleStrategy.STAND_GROUND);
        expect(state.smartPilot.design.maxSpeed).toBe(cap);
        expect(state.capsule.integrity).toBeCloseTo(0.3);
    });
});

describe('runTraining', () => {
    jest.setTimeout(30_000);

    it('measures a T0 run that times out before the kill', async () => {
        const result = await runTraining(trainingScenarios.T0, { seed: 1, timeoutSeconds: 5 });

        expect(result).toMatchObject({ scenario: 'T0', seed: 1, killed: false, targetHealth: 1 });
        expect(result.seconds).toBeCloseTo(5, 1);
        expect(result.meanDistance).toBeGreaterThan(0);
        expect(result.inRangeFraction).toBeGreaterThanOrEqual(0);
        expect(result.inRangeFraction).toBeLessThanOrEqual(1);
        expect(result.killZoneFraction).toBeGreaterThanOrEqual(0);
        expect(result.killZoneFraction).toBeLessThanOrEqual(1);
    });

    it('without a `recording` option still analyzes via a scratch recording, then cleans it up', async () => {
        const metrics = await runTraining(trainingScenarios.T0, { seed: 1, timeoutSeconds: 5 });

        expect(metrics.recording).toBeUndefined();
        expect(metrics.frames).toBeUndefined();
        expect(Array.isArray(metrics.failedChecks)).toBe(true);
        // T0 seed 1 never kills in 5 s and never strips armor that fast either -- shouldn't crash
        // or report a false failure for checks whose inputs (e.g. an `armor_stripped` event)
        // don't exist yet.
        expect(metrics.killed).toBe(false);
    });

    it('with a `recording` option keeps the recording and counts blast hits from its sidecar', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-training-recording-'));
        try {
            const result = await runTraining(trainingScenarios.T0, {
                seed: 1,
                timeoutSeconds: 10,
                recording: { dir, intervalSimSeconds: 1 },
            });

            expect(result.recording).toBe(path.join(dir, `T0_seed1${RECORDING_EXT}`));
            const frameLines = fs.readFileSync(result.recording!, 'utf-8').trim().split('\n').slice(1);
            expect(result.frames).toBe(frameLines.length);
            const targetBlasts = new Set(
                fs
                    .readFileSync(result.recording!.replace(RECORDING_EXT, EVENTS_EXT), 'utf-8')
                    .split('\n')
                    .filter((line) => line)
                    .map((line) => parseEventLine(line)!)
                    .flatMap((e) =>
                        e.kind === 'blast_hit' && e.objectId === TRAINING_TARGET_ID
                            ? [(e.data as { explosionId: string }).explosionId]
                            : [],
                    ),
            );
            expect(targetBlasts.size).toBeGreaterThan(0);
            expect(result.blastHits).toBe(targetBlasts.size);
        } finally {
            await rmDirRetrying(dir);
        }
    });
});

describe('runTraining with a crewed player', () => {
    jest.setTimeout(30_000);

    it('a crewed GVTS is a ShipManagerPc that does nothing unless a hook drives it', async () => {
        let manager: unknown;
        const result = await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 5,
            crewedPlayer: true,
            beforeTick: (game) => {
                manager ??= game.shipManagers.get(TRAINING_PLAYER_ID);
            },
        });

        expect(manager).toBeInstanceOf(ShipManagerPc);
        expect(result.killed).toBe(false);
        // The magazine still loads a round into the gun, so `shellsFired` can read 1 here.
        expect(result.secondsFiring).toBe(0);
    });

    it('awaits beforeTick once per tick, before the tick runs', async () => {
        let calls = 0;
        let pending = false;
        let lastGame: HeadlessGame | undefined;
        const secondsSeen: number[] = [];
        await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 1,
            beforeTick: async (game) => {
                expect(pending).toBe(false);
                pending = true;
                calls++;
                lastGame = game;
                const before = game.seconds;
                secondsSeen.push(before);
                await new Promise((resolve) => setTimeout(resolve, 0));
                expect(game.seconds).toBe(before);
                pending = false;
            },
        });

        expect(lastGame).toBeDefined();
        expect(calls).toBe(Math.round(lastGame!.seconds * SERVER_TICK_HZ));
        expect(new Set(secondsSeen).size).toBe(calls);
    });

    it('a hook that fires the chain gun at the target drives the crewed GVTS', async () => {
        const result = await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 2,
            crewedPlayer: true,
            beforeTick: (game) => {
                const crew = game.shipManagers.get(TRAINING_PLAYER_ID);
                if (!crew) {
                    throw new Error('GVTS missing');
                }
                crew.setTarget(TRAINING_TARGET_ID);
                crew.state.chainGuns[0].isFiring = true;
            },
        });

        expect(result.secondsFiring).toBeGreaterThan(0);
        expect(result.shellsFired).toBeGreaterThan(1);
    });
});
