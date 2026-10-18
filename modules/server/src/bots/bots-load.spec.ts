import { Driver, Faction, rosterSeats, sleep, waitFor } from '@starwards/core/internal';

import { makeDriver } from '../test/driver';
import { newShip } from '../admin/map-helper';
import { performance } from 'node:perf_hooks';
import { two_vs_one } from '../maps';

const MEASURE_MS = 60_000;
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

// two minutes and timing-sensitive: opt-in with STARWARDS_LOAD=1
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

        let samples: number[] = [];
        const update = manager.update.bind(manager);
        manager.update = (deltaSeconds: number) => {
            const start = performance.now();
            const result = update(deltaSeconds);
            samples.push(performance.now() - start);
            return result;
        };
        const measure = async () => {
            samples = [];
            await sleep(MEASURE_MS);
            return { p95: p95(samples), n: samples.length };
        };

        await sleep(2_000); // settle after map start
        const a = await measure();

        const driver = new Driver(new URL(gameDriver.url())).connect();
        try {
            const admin = await driver.getAdminDriver();
            for (const shipId of manager.state.playerShipIds) {
                for (const seat of rosterSeats) admin.assignBot({ shipId, seat, brain: 'reference' });
            }
            for (const shipId of manager.state.playerShipIds) {
                for (const seat of rosterSeats) {
                    await waitFor(
                        () => expect(admin.state.bots.get(shipId)?.seats.get(seat)?.status).toBe('running'),
                        30_000,
                        100,
                    );
                }
            }
            const b = await measure();
            // eslint-disable-next-line no-console
            console.log(
                `tick p95 without bots ${a.p95.toFixed(3)} ms (n=${a.n}), with bots ${b.p95.toFixed(3)} ms (n=${b.n})`,
            );
            expect(b.p95).toBeLessThanOrEqual(a.p95 * 1.1);
        } finally {
            driver.destroy();
        }
    });
});
