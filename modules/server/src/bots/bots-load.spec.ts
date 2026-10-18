import { Driver, Faction, rosterSeats, seatScreens, sleep, waitFor } from '@starwards/core/internal';

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { makeDriver } from '../test/driver';
import { newShip } from '../admin/map-helper';
import { two_vs_one } from '../maps';

const MEASURE_MS = Number(process.env.STARWARDS_LOAD_MS ?? 60_000);
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

// Two minutes and timing-sensitive: opt-in with STARWARDS_LOAD=1. 15 s windows (STARWARDS_LOAD_MS=15000)
// were tried for CI and flaked: update() p95 varied +0.5% to +26% between identical runs.
const run = process.env.STARWARDS_LOAD ? describe : describe.skip;

run('bot load', () => {
    jest.setTimeout(300_000);
    const gameDriver = makeDriver();

    it('keeps the tick p95 within 10% with three ships fully crewed by bots', async () => {
        const manager = gameDriver.gameManager;
        await manager.startGame(two_vs_one);
        for (let i = manager.state.playerShipIds.length; i < 3; i++) {
            manager.scriptApi.addPlayerSpaceship(newShip(`LOAD${i}`, Faction.Gravitas, 'gravitas'));
        }
        await waitFor(() => expect(manager.state.playerShipIds.length).toBe(3), 10_000);

        // update(): the tick's own work. interval: start-to-start, which also grows with whatever
        // else the event loop runs between ticks (the bots' sockets and patches).
        let samples: number[] = [];
        let intervals: number[] = [];
        let lastStart = 0;
        const update = manager.update.bind(manager);
        manager.update = (deltaSeconds: number) => {
            const start = performance.now();
            if (lastStart) intervals.push(start - lastStart);
            lastStart = start;
            const result = update(deltaSeconds);
            samples.push(performance.now() - start);
            return result;
        };
        const measure = async () => {
            samples = [];
            intervals = [];
            lastStart = 0;
            const loop = monitorEventLoopDelay({ resolution: 10 });
            loop.enable();
            await sleep(MEASURE_MS);
            loop.disable();
            return {
                p95: p95(samples),
                interval: p95(intervals),
                loop: loop.percentile(95) / 1e6,
                n: samples.length,
            };
        };

        await sleep(2_000); // settle after map start
        const a = await measure();

        // a full human bridge: the bot-only tactical seat would double up on pilot and weapons
        const crewSeats = rosterSeats.filter((seat) => seatScreens(seat).length > 0);
        const driver = new Driver(new URL(gameDriver.url())).connect();
        try {
            const admin = await driver.getAdminDriver();
            for (const shipId of manager.state.playerShipIds) {
                for (const seat of crewSeats) admin.assignBot({ shipId, seat, brain: 'reference' });
            }
            for (const shipId of manager.state.playerShipIds) {
                for (const seat of crewSeats) {
                    await waitFor(
                        () => expect(admin.state.bots.get(shipId)?.seats.get(seat)?.status).toBe('running'),
                        30_000,
                        100,
                    );
                }
            }
            const b = await measure();
            // eslint-disable-next-line no-console
            console.log(`no bots ${JSON.stringify(a)}; with bots ${JSON.stringify(b)} (ms)`);
            expect(b.p95).toBeLessThanOrEqual(a.p95 * 1.1);
            expect(b.interval).toBeLessThanOrEqual(a.interval * 1.1);
        } finally {
            driver.destroy();
        }
    });
});
