import { QUARRY, SHIP, addShipAndQuarry } from './helms-tag.bench';

import { Benchmark } from './benchmark';
import { XY } from '@starwards/core/internal';
import fc from 'fast-check';

/** A crossing speed that sweeps the line of sight several degrees per second at 2–4 km. */
const QUARRY_SPEED = 150;
/** The chain gun's firing tolerance: the nose within this of the target. */
const ON_NOSE_DEGREES = 2;

type Params = { distance: number; bearing: number; side: 1 | -1 };

/**
 * Hold: an unarmed dragonfly 2–4 km away crosses the GVTS's line of sight at 150 m/s. Helms must keep
 * the nose on it. Weapons locks and fires (`reference`). Score: the share of the 60 s with the nose
 * within 2° of the quarry.
 */
const helmsHold: Benchmark<Params> = {
    name: 'helms-hold',
    station: 'helms',
    description: 'keep the nose within 2° of an unarmed dragonfly crossing at 150 m/s',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 4000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        side: fc.constantFrom<1 | -1>(1, -1),
    }),
    createMap: ({ distance, bearing, side }) => ({
        name: 'bench_helms_hold',
        init: (game) => {
            const start = addShipAndQuarry(game, distance, bearing, QUARRY_SPEED);
            game.orderMove(QUARRY, XY.add(start, XY.byLengthAndDirection(200_000, bearing + 90 * side)));
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 60,
    supporting: [{ station: 'weapons', policy: 'reference' }],
    scorer: () => {
        let seconds = 0;
        let onNoseSeconds = 0;
        let offSum = 0;
        return {
            sample(game, dt) {
                const ship = game.spaceManager.state.get(SHIP);
                const quarry = game.spaceManager.state.get(QUARRY);
                if (!ship || !quarry) throw new Error('helms benchmark ships are missing');
                seconds += dt;
                const bearing = XY.angleOf(XY.difference(quarry.position, ship.position));
                const off = Math.abs(((((bearing - ship.angle) % 360) + 540) % 360) - 180);
                offSum += off * dt;
                if (off <= ON_NOSE_DEGREES) onNoseSeconds += dt;
            },
            result: () => ({
                score: seconds ? onNoseSeconds / seconds : 0,
                onNoseSeconds,
                meanOffNose: seconds ? offSum / seconds : NaN,
            }),
        };
    },
};

export default helmsHold;
