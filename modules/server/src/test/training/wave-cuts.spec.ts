import { DockingMode, XY } from '@starwards/core/internal';
import { runTraining, trainingScenarios } from './training-scenarios';

import { HeadlessGame } from '../headless-game';
import { STATIONS } from '../../scenarios/wave-defence';
import { waveRung } from './wave-rung';

const GVTS = 'GVTS';

/** Starts a scenario's map without playing it. */
function started(name: string, waveSeed = 7) {
    const scenario = trainingScenarios[name];
    const { map } = scenario.track!({ waveSeed } as never);
    return { game: HeadlessGame.start(map, 1, { crewedPlayer: true }) };
}

const pos = (game: HeadlessGame, id: string) => game.api.getObject(id)!.position;
const distance = (game: HeadlessGame, a: string, b: string) => XY.lengthOf(XY.difference(pos(game, a), pos(game, b)));

/** The wave-1 target: the station the wave-1 heavy was ordered at, read as the station nearest the raiders. */
function raidersAndTarget(game: HeadlessGame) {
    const raiders = [...game.api.getObjects()].filter(
        (o) => o.type === 'Spaceship' && o.id !== GVTS && !STATIONS.some((s) => s.id === o.id),
    );
    const centre = XY.scale(
        raiders.reduce<XY>((a, r) => XY.add(a, r.position), XY.zero),
        1 / raiders.length,
    );
    const target = STATIONS.reduce((best, s) =>
        XY.lengthOf(XY.difference(s.position, centre)) < XY.lengthOf(XY.difference(best.position, centre)) ? s : best,
    );
    return { raiders, centre, target };
}

describe('wave scenario cuts', () => {
    it.each(['W-cut-intercept', 'W-cut-undock', 'W-cut-lof', 'W-cut-magazine'])('%s is a training rung', (name) => {
        expect(trainingScenarios[name]).toHaveProperty('track');
    });

    it('brings wave 1 in to 25 km of its target', () => {
        const { game } = started('W-cut-intercept');
        const { centre, target } = raidersAndTarget(game);
        expect(XY.lengthOf(XY.difference(centre, target.position))).toBeCloseTo(25_000, -3);
    });

    it.each(['W-cut-intercept', 'W-cut-undock', 'W-cut-lof', 'W-cut-magazine'])(
        '%s opens on a wave heavier than the map wave 1 (two fighters)',
        (name) => {
            const { game } = started(name);
            expect(raidersAndTarget(game).raiders.length).toBeGreaterThan(2);
        },
    );

    it('intercept: the GVTS waits 3 km off another station than the wave-1 target', () => {
        const { game } = started('W-cut-intercept');
        const { target } = raidersAndTarget(game);
        const others = STATIONS.filter((s) => s.id !== target.id).map((s) => distance(game, GVTS, s.id));
        expect(Math.min(...others)).toBeCloseTo(3_000, -2);
    });

    it('undock: the GVTS starts docked at another station than the wave-1 target', () => {
        const { game } = started('W-cut-undock');
        const { target } = raidersAndTarget(game);
        game.tick(1 / 60);
        const docking = game.api.getShip(GVTS)!.state.docking;
        expect(docking.mode).toBe(DockingMode.DOCKED);
        expect(docking.targetId).not.toBe(target.id);
        expect(docking.targetId).not.toBe('');
    });

    it('undock: the board holds the captain dock order at that station, as when the captain docked to restock', () => {
        const { game } = started('W-cut-undock');
        game.tick(1 / 60);
        const state = game.api.getShip(GVTS)!.state;
        const dock = state.orderBoard.slots.get('navigation');
        expect(dock).toMatchObject({ kind: 'dock_for_repair', issuer: 'captain' });
        expect(dock!.status).not.toBe('aborted');
        expect(dock!.params.station.name).toBe(state.docking.targetId);
    });

    it('undock: the GVTS starts on a quarter store with its reactor efficiency shot down to 0.05', () => {
        const { game } = started('W-cut-undock');
        const reactor = game.api.getShip(GVTS)!.state.reactor;
        expect(reactor.energy / reactor.design.maxEnergy).toBeCloseTo(0.25, 2);
        expect(reactor.effeciencyFactor).toBeCloseTo(0.05, 3);
    });

    it('line of fire: the GVTS sits 3 km behind the wave-1 target, the station between it and the raiders', () => {
        const { game } = started('W-cut-lof');
        const { centre, target } = raidersAndTarget(game);
        expect(distance(game, GVTS, target.id)).toBeCloseTo(3_000, -2);
        const toRaiders = XY.normalize(XY.difference(centre, target.position));
        const toGvts = XY.normalize(XY.difference(pos(game, GVTS), target.position));
        expect(XY.dot(toRaiders, toGvts)).toBeLessThan(-0.99);
    });

    it('magazine: the GVTS starts with its magazine capacity at 0.135, beside the wave-1 target', () => {
        const { game } = started('W-cut-magazine');
        const { target } = raidersAndTarget(game);
        expect(game.api.getShip(GVTS)!.state.magazine.capacity).toBeCloseTo(0.135, 3);
        expect(distance(game, GVTS, target.id)).toBeLessThan(4_000);
    });

    it('scores the stations: capsule and armor lost add up per station, a lost station counting 1 each', async () => {
        const rung = waveRung({ name: 'W-test', waveIntervalSeconds: 30, passWaves: 10 });
        const result = await runTraining(rung, { seed: 1, timeoutSeconds: 20, hz: 10 });
        expect(result.waves).toMatchObject({ stationCapsuleLost: 0, stationArmorLost: 0 });
        expect(result.waves?.endSeconds).toBeCloseTo(20, 0);
    }, 60_000);
});
