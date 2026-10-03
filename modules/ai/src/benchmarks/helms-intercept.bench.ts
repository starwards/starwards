import { QUARRY, SHIP, addShipAndQuarry, inTail } from './helms-tag.bench';

import { Benchmark } from './benchmark';
import { XY } from '@starwards/core/internal';
import fc from 'fast-check';

/** Slow enough that the GVTS (450 m/s) closes at least 300 m/s on it from any side. */
const QUARRY_SPEED = 150;

type Params = { distance: number; bearing: number; heading: number };

/**
 * Intercept: an unarmed dragonfly 3–6 km away cruises a straight course at 150 m/s. Helms must reach
 * the firing position 500 m behind it as fast as it can. Weapons locks and fires (`reference`).
 * Score: 1 − (seconds to first reach the position) / 90; 0 if never reached. The run ends on arrival.
 */
const helmsIntercept: Benchmark<Params> = {
    name: 'helms-intercept',
    station: 'helms',
    description: 'reach 500 m behind an unarmed dragonfly cruising at 150 m/s as fast as possible',
    params: fc.record({
        distance: fc.integer({ min: 3000, max: 6000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
        heading: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: ({ distance, bearing, heading }) => ({
        name: 'bench_helms_intercept',
        init: (game) => {
            const start = addShipAndQuarry(game, distance, bearing, QUARRY_SPEED);
            game.orderMove(QUARRY, XY.add(start, XY.byLengthAndDirection(200_000, heading)));
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 90,
    supporting: [{ station: 'weapons', policy: 'reference' }],
    scorer: () => {
        let seconds = 0;
        let arrivedAt = NaN;
        let closest = Infinity;
        return {
            sample(game, dt) {
                seconds += dt;
                const { distance, tail } = inTail(game);
                if (distance < closest) closest = distance;
                if (tail && Number.isNaN(arrivedAt)) arrivedAt = seconds;
            },
            done: () => !Number.isNaN(arrivedAt),
            result: () => ({
                score: Number.isNaN(arrivedAt) ? 0 : 1 - arrivedAt / helmsIntercept.timeoutSeconds,
                arrivedAt: Number.isNaN(arrivedAt) ? helmsIntercept.timeoutSeconds : arrivedAt,
                closest,
            }),
        };
    },
};

export default helmsIntercept;
