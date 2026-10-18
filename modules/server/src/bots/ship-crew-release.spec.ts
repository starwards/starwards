import { BotStatus, BridgeSeat, Driver } from '@starwards/core/internal';

import { makeDriver } from '../test/driver';
import { shipCrew } from './ship-crew';
import { training_t0 } from '../maps';

const SHIP = 'GVTS';
const TRIGGER = '/chainGuns/0/isFiring';

const until = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`condition not met within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 10));
    }
};

/** A paused game: a held trigger is let go only by an abort, never by time passing. */
const pausedWait = (_: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));

describe('ship crew letting go of held buttons', () => {
    jest.setTimeout(60_000);
    const gameDriver = makeDriver();
    let driver: Driver;
    /** Every trigger write, and `stopped` / `removed` where those promises resolved. */
    let log: unknown[];
    let statuses: { seat: BridgeSeat; status: BotStatus; message?: string }[];

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(training_t0);
        driver = new Driver(new URL(gameDriver.url())).connect();
        log = [];
        statuses = [];
        const shipDriver = await driver.getShipDriver(SHIP);
        const send = shipDriver.sendJsonCmd.bind(shipDriver);
        jest.spyOn(shipDriver, 'sendJsonCmd').mockImplementation((pointer, value) => {
            if (pointer === TRIGGER) log.push([pointer, value]);
            send(pointer, value);
        });
    });
    afterEach(() => driver.destroy());

    const startMidBurst = async () => {
        const crew = await shipCrew({
            driver,
            baseUrl: new URL(gameDriver.url()),
            shipId: SHIP,
            emit: () => undefined,
            onStatus: (seat, _, status, message) => statuses.push({ seat, status, message }),
            logError: () => undefined,
            wait: pausedWait,
        });
        crew.addSeat('pilot', 'bot-pilot-1', 'reference');
        crew.addSeat('weapons', 'bot-weapons-2', 'reference');
        await until(() => log.length > 0, 45_000);
        expect(log).toEqual([[TRIGGER, true]]);
        return crew;
    };

    it('stop while a removal is under way resolves only after the trigger is let go', async () => {
        const crew = await startMidBurst();
        // as the worker handles unseat then stop: no await between them
        void crew.removeSeat('weapons');
        await crew.stop();
        log.push('stopped');
        expect(log).toEqual([[TRIGGER, true], [TRIGGER, false], 'stopped']);
    });

    it('a seat removed twice returns the one removal, which resolves after the trigger is let go', async () => {
        const crew = await startMidBurst();
        const first = crew.removeSeat('weapons');
        const second = crew.removeSeat('weapons');
        expect(second).toBe(first);
        await second;
        log.push('removed');
        expect(log).toEqual([[TRIGGER, true], [TRIGGER, false], 'removed']);
        await crew.stop();
    });

    it('refuses a seat added after stop', async () => {
        const crew = await startMidBurst();
        await crew.stop();
        crew.addSeat('weapons', 'bot-weapons-3', 'reference');
        expect(crew.seatCount).toBe(0);
        expect(statuses.at(-1)).toEqual({ seat: 'weapons', status: 'failed', message: 'the ship crew has stopped' });
    });
});
