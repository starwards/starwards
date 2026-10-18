import { Faction, Radar, Spaceship, XY, mulberry32, sectorCovers } from '@starwards/core/internal';
import { STATIONS, createWaveDefenceMap } from '../scenarios/wave-defence';

import { HeadlessGame } from './headless-game';

const HZ = 10;
const STATION_ID = 'station-large';

function scanBeam(game: HeadlessGame): Radar {
    const beam = game.api.getShip(STATION_ID)?.state.radars.find((radar) => radar.design.isScanBeam);
    if (!beam) {
        throw new Error('station-large has no scan beam');
    }
    return beam;
}

function raiders(game: HeadlessGame): Spaceship[] {
    return [...game.spaceManager.state.getAll('Spaceship')].filter(
        (ship) => ship.faction === Faction.Raiders && !ship.destroyed,
    );
}

function beamCovers(game: HeadlessGame, target: Spaceship) {
    const station = game.api.getShip(STATION_ID);
    if (!station) {
        return false;
    }
    const beam = scanBeam(game);
    const diff = XY.difference(target.position, station.state.position);
    return sectorCovers(
        { direction: beam.getGlobalBearing(station.state), arc: beam.arc, range: beam.range },
        XY.angleOf(diff),
        XY.lengthOf(diff),
        target.radius,
    );
}

/** Ticks until `done` holds or `maxSeconds` pass; returns whether it held. */
function runUntil(game: HeadlessGame, maxSeconds: number, done: () => boolean) {
    const until = game.seconds + maxSeconds;
    while (game.seconds < until) {
        game.tick(1 / HZ);
        if (done()) {
            return true;
        }
    }
    return false;
}

describe('uncrewed station scan beam in wave-defence geometry (M4.31)', () => {
    it('stations carry a 25 km omni and a 100 km scan beam', () => {
        const game = HeadlessGame.start(createWaveDefenceMap(mulberry32(1)), 1);
        for (const station of STATIONS) {
            const radars = game.api.getShip(station.id)?.state.radars ?? [];
            expect(radars.find((r) => !r.design.isScanBeam)?.design.range).toBe(25_000);
            expect(radars.find((r) => r.design.isScanBeam)?.design.range).toBe(100_000);
        }
    });

    it('sweeps while no raider is in the beam, follows the first raider it catches, and sweeps again once it is gone', () => {
        const game = HeadlessGame.start(createWaveDefenceMap(mulberry32(1)), 1);
        const station = game.api.getObject(STATION_ID);
        expect(station).toBeDefined();
        const spawnDistance = Math.min(
            ...raiders(game).map((raider) => XY.distance(raider.position, station?.position ?? XY.zero)),
        );
        expect(spawnDistance).toBeGreaterThan(130_000); // 140 km spawn, minus jitter

        // sweeping: raiders are beyond the beam's 100 km, so it keeps turning at ~30 deg/s
        const sweptDegrees = Math.abs(sumTurn(game, 6));
        expect(sweptDegrees).toBeGreaterThan(150);

        // the inbound raiders cross 100 km and the sweep catches one
        expect(runUntil(game, 400, () => raiders(game).some((raider) => beamCovers(game, raider)))).toBe(true);
        const followed = raiders(game).find((raider) => beamCovers(game, raider));
        expect(followed).toBeDefined();
        if (!followed) {
            return;
        }
        expect(XY.distance(followed.position, station?.position ?? XY.zero)).toBeGreaterThan(25_000); // beyond the omni

        // following: the beam keeps that raider covered as it moves (one tick of slew allowed to settle)
        game.tick(1 / HZ);
        let uncoveredTicks = 0;
        runUntil(game, 30, () => {
            if (!beamCovers(game, followed)) {
                uncoveredTicks++;
            }
            return followed.destroyed;
        });
        expect(uncoveredTicks).toBe(0);

        // gone: every raider destroyed, so the beam has nothing to follow and sweeps again
        for (const raider of raiders(game)) {
            game.spaceManager.destroyObject(raider.id);
        }
        game.tick(1 / HZ);
        expect(Math.abs(sumTurn(game, 6))).toBeGreaterThan(150);
    }, 120_000);
});

/** Signed degrees the station beam turned over `seconds`, accumulated per tick so wrapping past ±180 is not lost. */
function sumTurn(game: HeadlessGame, seconds: number) {
    let turned = 0;
    let last = scanBeam(game).bearing;
    runUntil(game, seconds, () => {
        const now = scanBeam(game).bearing;
        let delta = now - last;
        delta -= 360 * Math.round(delta / 360);
        turned += delta;
        last = now;
        return false;
    });
    return turned;
}
