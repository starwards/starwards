import { Driver, RecordingEventLine } from '@starwards/core/internal';

import { makeDriver } from '../test/driver';
import { shipCrew } from './ship-crew';
import { training_t0 } from '../maps';

jest.mock('@starwards/bots', () => {
    const actual = jest.requireActual<typeof import('@starwards/bots')>('@starwards/bots');
    return {
        ...actual,
        buttonBrain: () => ({
            decide: () => Promise.reject(new Error('brain exploded')),
        }),
    };
});

const until = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`condition not met within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 50));
    }
};

describe('ship crew runner with a throwing brain', () => {
    jest.setTimeout(40_000);
    const gameDriver = makeDriver();
    let driver: Driver;

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(training_t0);
        driver = new Driver(new URL(gameDriver.url())).connect();
    });
    afterEach(() => driver.destroy());

    it('logs every brain error while recording is off', async () => {
        const events: Omit<RecordingEventLine, 't'>[] = [];
        const errors: string[] = [];
        const crew = await shipCrew({
            driver,
            baseUrl: new URL(gameDriver.url()),
            shipId: 'GVTS',
            emit: (e) => events.push(e),
            onStatus: () => undefined,
            logError: (m) => errors.push(m),
        });
        try {
            crew.addSeat('pilot', 'bot-pilot-1', 'reference');
            await until(() => errors.length >= 2, 10_000);
        } finally {
            await crew.stop();
        }
        expect(errors[0]).toBe('bot-pilot-1 on pilot brain error: brain exploded');
        expect(events).toEqual([]);
    });
});
