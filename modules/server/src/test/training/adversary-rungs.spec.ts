import { Faction, FlightDoctrine, IdleStrategy } from '@starwards/core/internal';
import { adversaryProfiles, waveAdversaryProfiles } from '../../scenarios/adversary-profile';
import { runTraining, trainingScenarios } from './training-scenarios';

import { HeadlessGame } from '../headless-game';
import { TRAINING_TARGET_ID } from '../../scenarios/training';
import fc from 'fast-check';

/** The A1 raider two ticks into its seed-1 layout: the space manager takes the map's orders on the first, the ship on the second. */
function a1Raider(profile: string) {
    const scenario = trainingScenarios[`A1-${profile}`];
    const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
    const game = HeadlessGame.start(scenario.createMap(params), 1);
    game.tick(1 / 60);
    game.tick(1 / 60);
    const ship = game.api.getShip(TRAINING_TARGET_ID);
    if (!ship) {
        throw new Error(`A1-${profile}: no raider`);
    }
    return ship.state;
}

describe('adversary rungs', () => {
    it('has A1 for every profile and AW for every profile a wave can apply', () => {
        for (const { name } of Object.values(adversaryProfiles)) {
            expect(trainingScenarios).toHaveProperty([`A1-${name}`]);
        }
        for (const { name } of waveAdversaryProfiles) {
            expect(trainingScenarios).toHaveProperty([`AW-${name}`]);
        }
        expect(trainingScenarios).not.toHaveProperty(['AW-standground']);
    });

    it('A1-today plays exactly as T1', async () => {
        const options = { seed: 1, timeoutSeconds: 40, hz: 10 };
        const t1 = await runTraining(trainingScenarios.T1, options);
        const today = await runTraining(trainingScenarios['A1-today'], options);
        expect(today).toMatchObject({
            killed: t1.killed,
            seconds: t1.seconds,
            shellsFired: t1.shellsFired,
            meanDistance: t1.meanDistance,
            targetHealth: t1.targetHealth,
        });
    }, 60_000);

    it('each profile sets its lever on the raider and no other', () => {
        expect(a1Raider('today').flightDoctrine).toBe(FlightDoctrine.AUTO);
        expect(a1Raider('intercept').flightDoctrine).toBe(FlightDoctrine.INTERCEPT);
        expect(a1Raider('standoff').flightDoctrine).toBe(FlightDoctrine.STANDOFF);
        expect(a1Raider('shadow').flightDoctrine).toBe(FlightDoctrine.SHADOW);
        expect(a1Raider('noweave').labNoCombatWeave).toBe(true);
        expect(a1Raider('today').labNoCombatWeave).toBe(false);
        expect(a1Raider('standground').idleStrategy).toBe(IdleStrategy.STAND_GROUND);
    });

    it('the doctrine profiles move the raider to different ranges', async () => {
        const meanDistance = async (profile: string) =>
            (await runTraining(trainingScenarios[`A1-${profile}`], { seed: 1, timeoutSeconds: 60, hz: 10 }))
                .meanDistance;
        expect(Math.abs((await meanDistance('shadow')) - (await meanDistance('standoff')))).toBeGreaterThan(100);
    }, 120_000);

    it('AW applies the profile to every raider of the wave', () => {
        const scenario = trainingScenarios['AW-shadow'];
        const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
        const tracked = scenario.track?.(params);
        if (!tracked) {
            throw new Error('AW-shadow has no tracker');
        }
        const game = HeadlessGame.start(tracked.map, 1, { crewedPlayer: true });
        for (let i = 0; i < 5; i++) {
            game.tick(1 / 60);
            tracked.tracker.done(game);
        }
        const raiders = [...game.shipManagers.values()].filter((m) => m.state.faction === Faction.Raiders);
        expect(raiders.length).toBeGreaterThan(0);
        for (const raider of raiders) {
            expect(raider.state.flightDoctrine).toBe(FlightDoctrine.SHADOW);
        }
    });
});
