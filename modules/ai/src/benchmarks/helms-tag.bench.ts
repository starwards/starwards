import { Faction, IdleStrategy, Spaceship, Vec2, XY } from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import { GameApi } from '@starwards/core/internal';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import fc from 'fast-check';

export const SHIP = 'GVTS';
export const QUARRY = 'quarry';

/** The firing position: this far behind the quarry's motion, give or take the tolerance. */
const TAIL_METERS = 500;
const TAIL_TOLERANCE_METERS = 250;
/** How far off the quarry's tail line still counts as behind it. */
const TAIL_CONE_DEGREES = 30;
/** The quarry's speed: well under the GVTS's 450 m/s, so a pilot can catch it and sit on its tail. */
const QUARRY_SPEED = 250;

/**
 * Adds a GVTS at the origin and a dragonfly quarry `distance` away on `bearing` that flies no faster
 * than `speed`. Both magazines are empty: weapons can lock (the target modes need it) but no shell
 * flies, so neither blasts nor return fire knock either ship off the course helms is scored on.
 * Returns the quarry's start.
 */
export function addShipAndQuarry(game: GameApi, distance: number, bearing: number, speed: number) {
    const ship = game.addPlayerSpaceship(new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
    const start = XY.byLengthAndDirection(distance, bearing);
    const quarry = game.addNpcSpaceship(
        new Spaceship().init(QUARRY, Vec2.make(start), 'dragonfly-MK1', Faction.Raiders),
    );
    quarry.state.idleStrategy = IdleStrategy.PLAY_DEAD;
    quarry.state.smartPilot.design.maxSpeed = speed;
    quarry.state.smartPilot.design.maxSpeedFromAfterBurner = speed;
    for (const magazine of [ship.state.magazine, quarry.state.magazine]) {
        magazine.count_HiExpShell = 0;
        magazine.count_ArmPenShell = 0;
        magazine.count_FragShell = 0;
    }
    return start;
}

/** Whether the GVTS sits in the firing position behind the quarry's motion (the referee's view). */
export function inTail(game: HeadlessGame) {
    const ship = game.spaceManager.state.get(SHIP);
    const quarry = game.spaceManager.state.get(QUARRY);
    if (!ship || !quarry) throw new Error('helms benchmark ships are missing');
    const fromQuarry = XY.difference(ship.position, quarry.position);
    const distance = XY.lengthOf(fromQuarry);
    const tailDirection = XY.angleOf(XY.negate(quarry.velocity));
    const offTail = Math.abs(((((XY.angleOf(fromQuarry) - tailDirection) % 360) + 540) % 360) - 180);
    return {
        distance,
        tail: Math.abs(distance - TAIL_METERS) <= TAIL_TOLERANCE_METERS && offTail <= TAIL_CONE_DEGREES,
    };
}

type Params = { distance: number; bearing: number; heading: number };

/**
 * Tag: an unarmed dragonfly flies a straight course at 250 m/s past the GVTS. Helms must get onto
 * its tail and stay there, about 500 m behind it, which is where the forward chain gun hits a
 * moving target. Weapons locks it (the `reference` policy). Score: the share of the run
 * spent in the tail position.
 */
const helmsTag: Benchmark<Params> = {
    name: 'helms-tag',
    station: 'helms',
    description: 'stay 500 m behind an unarmed dragonfly flying a straight course at 250 m/s',
    params: fc.record({
        distance: fc.integer({ min: 1000, max: 4000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        heading: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: ({ distance, bearing, heading }) => ({
        name: 'bench_helms_tag',
        init: (game) => {
            const start = addShipAndQuarry(game, distance, bearing, QUARRY_SPEED);
            game.orderMove(QUARRY, XY.add(start, XY.byLengthAndDirection(200_000, heading)));
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 90,
    supporting: [{ station: 'weapons', policy: 'reference' }],
    scorer: () => {
        let tailSeconds = 0;
        let seconds = 0;
        let distanceSum = 0;
        return {
            sample(game, dt) {
                const { distance, tail } = inTail(game);
                seconds += dt;
                distanceSum += distance * dt;
                if (tail) tailSeconds += dt;
            },
            result: () => ({
                score: seconds ? tailSeconds / seconds : 0,
                tailSeconds,
                meanDistance: seconds ? distanceSum / seconds : NaN,
            }),
        };
    },
};

export default helmsTag;
