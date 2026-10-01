import { Faction, Spaceship, Vec2, XY } from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import fc from 'fast-check';

const SHIP = 'GVTS';
const QUARRY = 'quarry';

/** The firing position: this far behind the quarry's motion, give or take the tolerance. */
const TAIL_METERS = 500;
const TAIL_TOLERANCE_METERS = 250;
/** How far off the quarry's tail line still counts as behind it. */
const TAIL_CONE_DEGREES = 30;

type Params = { distance: number; bearing: number; heading: number };

/**
 * Tag: a dragonfly flies a straight course past the GVTS and never shoots. Helms must get onto its
 * tail and stay there, about 500 m behind it, which is where the forward chain gun hits a moving
 * target. Weapons only locks it (the `reference` policy also fires, so the quarry may die: the run
 * then ends with whatever time was banked). Score: the share of the run spent in the tail position.
 */
const helmsTag: Benchmark<Params> = {
    name: 'helms-tag',
    station: 'helms',
    description: 'stay 500 m behind a dragonfly flying a straight course',
    params: fc.record({
        distance: fc.integer({ min: 1000, max: 6000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        heading: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: ({ distance, bearing, heading }) => ({
        name: 'bench_helms_tag',
        init: (game) => {
            game.addPlayerSpaceship(new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
            const start = XY.byLengthAndDirection(distance, bearing);
            game.addNpcSpaceship(new Spaceship().init(QUARRY, Vec2.make(start), 'dragonfly-MK1', Faction.Raiders));
            game.orderMove(QUARRY, XY.add(start, XY.byLengthAndDirection(200_000, heading)));
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 120,
    supporting: [{ station: 'weapons', policy: 'reference' }],
    scorer: () => {
        let tailSeconds = 0;
        let seconds = 0;
        let distanceSum = 0;
        return {
            sample(game, dt) {
                const ship = game.spaceManager.state.get(SHIP);
                const quarry = game.spaceManager.state.get(QUARRY);
                if (!ship || !quarry) return;
                seconds += dt;
                const fromQuarry = XY.difference(ship.position, quarry.position);
                const distance = XY.lengthOf(fromQuarry);
                distanceSum += distance * dt;
                const tailDirection = XY.angleOf(XY.negate(quarry.velocity));
                const offTail = Math.abs(((((XY.angleOf(fromQuarry) - tailDirection) % 360) + 540) % 360) - 180);
                if (Math.abs(distance - TAIL_METERS) <= TAIL_TOLERANCE_METERS && offTail <= TAIL_CONE_DEGREES) {
                    tailSeconds += dt;
                }
            },
            done: (game) => !game.spaceManager.state.get(QUARRY),
            result: () => ({
                score: seconds ? tailSeconds / seconds : 0,
                tailSeconds,
                meanDistance: seconds ? distanceSum / seconds : NaN,
            }),
        };
    },
};

export default helmsTag;
