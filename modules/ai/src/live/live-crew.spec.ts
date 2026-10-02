import { Driver, RecordingEventLine } from '@starwards/core/internal';

import { liveCrew } from './live-crew';
import { loadCrew } from '../crew/crew-config';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';
import path from 'node:path';

const { training_t0 } = maps;
const SHIP = 'GVTS';

describe('a crew of brains on a live server', () => {
    const gameDriver = makeDriver();

    it('decides at every seat and presses buttons on the running ship', async () => {
        await gameDriver.gameManager.startGame(training_t0);
        const baseUrl = new URL(gameDriver.url());
        const driver = new Driver(baseUrl).connect();
        try {
            const events: RecordingEventLine[] = [];
            const crew = loadCrew(path.resolve(__dirname, '../../crews/reference.json'));
            const live = await liveCrew({
                driver,
                baseUrl,
                shipId: SHIP,
                seats: crew.seats,
                write: (e) => events.push(e),
            });
            await live.run((t) => t < 15); // a lock needs the target scanned to BASIC first;

            const decided = new Set(
                events.filter((e) => e.kind === 'decision').map((e) => (e.data as { station: string }).station),
            );
            expect([...decided].sort()).toEqual(['engineer', 'helms', 'weapons']);
            expect(events.filter((e) => e.kind === 'brain_error')).toEqual([]);
            const commands = events.filter((e) => e.kind === 'command').map((e) => e.data as { ok: boolean });
            expect(commands.some((c) => c.ok)).toBe(true);
            expect(gameDriver.getShip(SHIP).state.weaponsTarget.targetId).toBeTruthy();
            expect(events.every((e, i) => i === 0 || e.t >= events[i - 1].t)).toBe(true);
        } finally {
            driver.destroy();
        }
    }, 30_000);
});
