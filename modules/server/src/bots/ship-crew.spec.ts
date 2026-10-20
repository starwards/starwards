import { BotStatus, BridgeSeat, Driver, RecordingEventLine, ScanLevel } from '@starwards/core/internal';

import { makeDriver } from '../test/driver';
import { shipCrew } from './ship-crew';
import { training_t0 } from '../maps';

const SHIP = 'GVTS';

type Event = Omit<RecordingEventLine, 't'>;
const stationOf = (e: Event) => (e.data as { station: string }).station;
const until = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`condition not met within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 50));
    }
};

describe('ship crew runner', () => {
    jest.setTimeout(40_000);
    const gameDriver = makeDriver();
    let driver: Driver;
    let events: Event[];
    let statuses: { seat: BridgeSeat; botId: string; status: BotStatus; message?: string }[];

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(training_t0);
        driver = new Driver(new URL(gameDriver.url())).connect();
        events = [];
        statuses = [];
    });
    afterEach(() => driver.destroy());

    const start = () =>
        shipCrew({
            driver,
            baseUrl: new URL(gameDriver.url()),
            shipId: SHIP,
            emit: (e) => events.push(e),
            onStatus: (seat, botId, status, message) => statuses.push({ seat, botId, status, message }),
            logError: () => undefined,
        });

    it('plays every seated station, reports running and emits only while recording', async () => {
        const crew = await start();
        crew.addSeat('pilot', 'bot-pilot-1', 'reference');
        crew.addSeat('weapons', 'bot-weapons-2', 'reference');
        crew.addSeat('engineer', 'bot-engineer-3', 'reference');
        await until(() => statuses.length === 3, 10_000);
        expect(events).toEqual([]);

        crew.setRecording(true);
        await until(() => !!gameDriver.getShip(SHIP).state.weaponsTarget.targetId, 15_000);
        await until(() => new Set(events.filter((e) => e.kind === 'decision').map(stationOf)).size === 3, 15_000);
        await crew.stop();

        expect(new Set(events.filter((e) => e.kind === 'decision').map(stationOf))).toEqual(
            new Set(['helms', 'weapons', 'engineer']),
        );
        expect(events.filter((e) => e.kind === 'brain_error')).toEqual([]);
        expect(events.every((e) => e.objectId === SHIP)).toBe(true);
        expect(statuses.map((s) => [s.seat, s.botId, s.status]).sort()).toEqual([
            ['engineer', 'bot-engineer-3', 'running'],
            ['pilot', 'bot-pilot-1', 'running'],
            ['weapons', 'bot-weapons-2', 'running'],
        ]);
    });

    it('plays the fused tactical station from the bot-only tactical seat', async () => {
        const crew = await start();
        crew.setRecording(true);
        crew.addSeat('tactical', 'bot-tactical-1', 'reference');
        await until(() => statuses.length === 1, 10_000);
        await until(() => events.some((e) => e.kind === 'decision'), 15_000);
        await crew.stop();
        expect(statuses.map((s) => [s.seat, s.status])).toEqual([['tactical', 'running']]);
        expect(new Set(events.filter((e) => e.kind === 'decision').map(stationOf))).toEqual(new Set(['tactical']));
        expect(events.filter((e) => e.kind === 'brain_error')).toEqual([]);
    });

    it('keeps a live order board: the captain bot orders, every seat reads the board, helms turns onto the target', async () => {
        const target = gameDriver.getShip('target');
        const gvts = gameDriver.getShip(SHIP);
        // an identified enemy inside the missile envelope, square off the beam
        target.spaceObject.position.setValue({ x: gvts.spaceObject.position.x, y: gvts.spaceObject.position.y + 2500 });
        (target.spaceObject.scanLevels as unknown as ScanLevel[])[gvts.spaceObject.faction] = ScanLevel.BASIC;
        const crew = await start();
        crew.setRecording(true);
        crew.addSeat('captain', 'bot-captain-1', 'reference');
        crew.addSeat('pilot', 'bot-pilot-2', 'reference');
        await until(() => statuses.length === 2, 10_000);
        const engagement = () => crew.orders?.orders.find((o) => o.slot === 'engagement');
        await until(() => engagement()?.kind === 'engage', 15_000);
        // the board is the ship's synced state: the server holds the captain's order the bots read
        expect(gvts.state.orderBoard.slots.get('engagement')).toMatchObject({ kind: 'engage', issuer: 'captain' });
        await until(
            () =>
                events.some(
                    (e) =>
                        e.kind === 'brain_request' &&
                        stationOf(e) === 'helms' &&
                        JSON.stringify(
                            (e.data as { display: { panels: Record<string, unknown> } }).display.panels.orders ?? '',
                        ).includes('engage'),
                ),
            15_000,
        );
        const bearing = () => {
            const d = {
                x: target.spaceObject.position.x - gvts.spaceObject.position.x,
                y: target.spaceObject.position.y - gvts.spaceObject.position.y,
            };
            const off = (((((Math.atan2(d.y, d.x) * 180) / Math.PI - gvts.spaceObject.angle) % 360) + 540) % 360) - 180;
            return Math.abs(off);
        };
        const before = bearing();
        await until(() => bearing() < Math.min(20, before / 2), 20_000);
        await crew.stop();
        expect(engagement()).toMatchObject({ kind: 'engage', issuer: 'captain' });
        expect(engagement()?.params.target?.name).toBeTruthy();
        expect(events.some((e) => e.kind === 'orders')).toBe(true);
        expect(events.filter((e) => e.kind === 'brain_error')).toEqual([]);
    });

    it('emits nothing while recording is off', async () => {
        const crew = await start();
        crew.addSeat('pilot', 'bot-pilot-1', 'reference');
        await until(() => statuses.length === 1, 10_000);
        await new Promise((r) => setTimeout(r, 1_000));
        await crew.stop();
        expect(events).toEqual([]);
    });

    it('stops a removed seat while its crewmates keep playing', async () => {
        const crew = await start();
        crew.setRecording(true);
        crew.addSeat('pilot', 'bot-pilot-1', 'reference');
        crew.addSeat('weapons', 'bot-weapons-2', 'reference');
        await until(() => statuses.length === 2, 10_000);
        await crew.removeSeat('weapons');
        expect(crew.seatCount).toBe(1);
        const at = events.length;
        await until(() => events.slice(at).filter((e) => e.kind === 'decision').length >= 3, 10_000);
        expect(events.slice(at).filter((e) => stationOf(e) === 'weapons')).toEqual([]);
        await crew.stop();
    });

    it('reports a seat it cannot open as failed', async () => {
        const crew = await start();
        crew.addSeat('sigint', 'bot-sigint-1', 'unknown' as never);
        await crew.stop();
        expect(statuses).toEqual([
            { seat: 'sigint', botId: 'bot-sigint-1', status: 'failed', message: 'no brain "unknown"' },
        ]);
    });

    it('emits nothing after stop resolves', async () => {
        const crew = await start();
        crew.setRecording(true);
        crew.addSeat('pilot', 'bot-pilot-1', 'reference');
        crew.addSeat('weapons', 'bot-weapons-2', 'reference');
        await until(() => statuses.length === 2, 10_000);
        await crew.stop();
        expect(crew.seatCount).toBe(0);
        const at = events.length;
        await new Promise((r) => setTimeout(r, 1_000));
        expect(events.length).toBe(at);
    });
});
