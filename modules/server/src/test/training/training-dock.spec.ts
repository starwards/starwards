import { DockingMode, XY } from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import { TRAINING_PLAYER_ID, TRAINING_TARGET2_ID, TRAINING_TARGET_ID } from '../../scenarios/training';

import { TRAINING_DOCK_ID } from '../../scenarios/training-dock';
import fc from 'fast-check';
import { trainingScenarios } from './training-scenarios';

const start = (seed: number) => {
    const scenario = trainingScenarios['T2-dock'];
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    return HeadlessGame.start(scenario.createMap(params), seed, { crewedPlayer: true });
};

describe('T2-dock', () => {
    it('is T2-constrained with an allied large station the GVTS can dock at', () => {
        const game = start(1);
        const state = game.spaceManager.state;
        const gvts = state.getShip(TRAINING_PLAYER_ID)!;
        const station = state.getShip(TRAINING_DOCK_ID)!;
        expect(station.model).toBe('large-station');
        expect(station.faction).toBe(gvts.faction);
        expect(state.getShip(TRAINING_TARGET_ID)!.faction).not.toBe(gvts.faction);
        expect(state.getShip(TRAINING_TARGET2_ID)!.faction).not.toBe(gvts.faction);
        const surface = XY.distance(station.position, gvts.position) - station.radius;
        expect(surface).toBeGreaterThanOrEqual(2_000);
        expect(surface).toBeLessThanOrEqual(5_000);
    });

    it('docks a crewed GVTS that presses dock near the station, and restocks it there', () => {
        const game = start(1);
        const gvtsManager = game.shipManagers.get(TRAINING_PLAYER_ID)!;
        const gvts = gvtsManager.state;
        const station = game.spaceManager.state.getShip(TRAINING_DOCK_ID)!;
        const away = XY.normalize(XY.difference(gvts.position, station.position));
        game.spaceManager.state
            .getShip(TRAINING_PLAYER_ID)!
            .position.setValue(
                XY.add(station.position, XY.byLengthAndDirection(station.radius + 400, XY.angleOf(away))),
            );
        const shells = gvts.magazine.count_HiExpShell;
        gvts.docking.toggleCommand = true;
        for (let i = 0; i < 60 * SERVER_TICK_HZ && gvts.docking.mode !== DockingMode.DOCKED; i++) {
            game.tick(1 / SERVER_TICK_HZ);
        }
        expect(gvts.docking.mode).toBe(DockingMode.DOCKED);
        for (let i = 0; i < 20 * SERVER_TICK_HZ; i++) game.tick(1 / SERVER_TICK_HZ);
        expect(gvts.magazine.count_HiExpShell).toBeGreaterThan(shells);
    });
});
