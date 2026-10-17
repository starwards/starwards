import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';

import { AdminDriver, Driver, EVENTS_EXT, GameStatus, parseEventLine, sleep, waitFor } from '@starwards/core/internal';

import { BotSupervisor } from './supervisor';
import { GameManager } from '../admin/game-manager';
import { makeDriver } from '../test/driver';
import { matchMaker } from '@colyseus/core';
import { two_vs_one } from '../maps';

const openConnections = async () => (await matchMaker.query({})).reduce((n, room) => n + room.clients, 0);
const botEntries = (m: GameManager) => [...m.state.bots.values()].reduce((n, s) => n + s.seats.size, 0);
const waitStatus = (admin: AdminDriver, ship: string, seat: string, status: string) =>
    waitFor(() => expect(admin.state.bots.get(ship)?.seats.get(seat)?.status).toBe(status), 15_000, 100);

/** A full collection without `--expose-gc`: exposes `gc` at runtime and runs it in a fresh context. */
const settledHeap = async () => {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as () => void;
    await sleep(500);
    gc();
    gc();
    return process.memoryUsage().heapUsed;
};

const readEvents = async (file: string) =>
    (await fs.readFile(file, 'utf-8'))
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => parseEventLine(l));

describe('bot lifecycle', () => {
    jest.setTimeout(60_000);
    const gameDriver = makeDriver();
    const manager = () => gameDriver.gameManager;
    const supervisor = () => manager().botSeats as BotSupervisor;
    let driver: Driver;
    let admin: AdminDriver;

    beforeEach(async () => {
        await manager().startGame(two_vs_one);
        driver = new Driver(new URL(gameDriver.url())).connect();
        admin = await driver.getAdminDriver();
    });
    afterEach(() => {
        driver.destroy();
    });

    describe('toggle', () => {
        jest.setTimeout(300_000);
        it('toggling a bot 20 times and running 3 games leaks nothing', async () => {
            const baseline = await openConnections();
            let firstHeap = 0;
            for (let i = 0; i < 20; i++) {
                admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
                await waitStatus(admin, 'GVTS', 'pilot', 'running');
                admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'none' });
                await waitFor(() => expect(admin.state.bots.get('GVTS')?.seats.get('pilot')).toBeUndefined(), 5_000);
                if (i === 0) {
                    await supervisor().stopAll();
                    firstHeap = await settledHeap();
                }
            }
            for (let g = 0; g < 3; g++) {
                if (!manager().state.isGameRunning) await manager().startGame(two_vs_one);
                admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
                admin.assignBot({ shipId: 'GVTS', seat: 'weapons', brain: 'reference' });
                await waitStatus(admin, 'GVTS', 'pilot', 'running');
                await waitStatus(admin, 'GVTS', 'weapons', 'running');
                await manager().stopGame();
            }
            await supervisor().stopAll();
            expect(supervisor().workerCount).toBe(0);
            expect(botEntries(manager())).toBe(0);
            await waitFor(async () => expect(await openConnections()).toBe(baseline), 5_000, 100);
            const lastHeap = await settledHeap();
            // eslint-disable-next-line no-console
            console.log(`heap after first cycle ${firstHeap}, after all ${lastHeap}`);
            expect(lastHeap).toBeLessThanOrEqual(firstHeap * 1.2);
        });
    });
});
