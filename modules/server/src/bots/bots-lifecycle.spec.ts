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

    it('a worker throw fails its bots and the game keeps running', async () => {
        const real = manager().botSeats;
        const crashing = new BotSupervisor(
            manager(),
            () => gameDriver.url(),
            () => {},
            () => "require('node:worker_threads').parentPort.once('message', () => { throw new Error('boom'); })",
        );
        manager().botSeats = crashing;
        try {
            admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
            admin.assignBot({ shipId: 'GVTS', seat: 'weapons', brain: 'reference' });
            await waitStatus(admin, 'GVTS', 'pilot', 'failed');
            await waitStatus(admin, 'GVTS', 'weapons', 'failed');
            expect(admin.state.bots.get('GVTS')?.seats.get('pilot')?.message).toContain('boom');
            expect(admin.state.bots.get('GVTS')?.seats.get('weapons')?.message).toContain('boom');
            expect(manager().state.gameStatus).toBe(GameStatus.RUNNING);
            const before = manager().totalSeconds;
            await sleep(2_000);
            expect(manager().totalSeconds).toBeGreaterThan(before);
            expect(crashing.workerCount).toBe(0);
        } finally {
            await crashing.stopAll();
            manager().botSeats = real;
        }
        admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
        await waitStatus(admin, 'GVTS', 'pilot', 'running');
    });

    it('stopping the game stops every bot', async () => {
        for (const shipId of ['GVTS', 'GVTS2']) {
            for (const seat of ['pilot', 'weapons', 'engineer']) admin.assignBot({ shipId, seat, brain: 'reference' });
        }
        for (const shipId of ['GVTS', 'GVTS2']) {
            for (const seat of ['pilot', 'weapons', 'engineer']) await waitStatus(admin, shipId, seat, 'running');
        }
        expect(supervisor().workerCount).toBe(2);
        admin.stopGame();
        await waitFor(() => expect(admin.state.gameStatus).toBe(GameStatus.STOPPED), 15_000, 100);
        expect(supervisor().workerCount).toBe(0);
        expect(admin.state.bots.size).toBe(0);
        expect(manager().state.bots.size).toBe(0);
    });

    describe('attach', () => {
        const stationOf = (id: string) => {
            const s = admin.state.stations.get(id);
            return s && { shipId: s.shipId, stationType: s.stationType };
        };
        const human = async (stationId: string, stationType: string) => {
            const d = new Driver(new URL(gameDriver.url())).connect();
            const a = await d.getAdminDriver();
            a.registerStation({ stationId, stationType, shipId: 'GVTS' });
            admin.assignStation({ stationId, shipId: 'GVTS', stationType });
            await waitFor(() => expect(stationOf(stationId)).toEqual({ shipId: 'GVTS', stationType }), 5_000, 100);
            return d;
        };

        it('a human on a bot seat leaves the bot playing', async () => {
            admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
            await waitStatus(admin, 'GVTS', 'pilot', 'running');
            const name = await admin.startRecording();
            const sidecar = path.join(gameDriver.recordingsDir, name.slice(0, -'.sgr'.length) + EVENTS_EXT);
            const decisions = async () =>
                (await readEvents(sidecar).catch(() => [])).filter((e) => e?.kind === 'decision').length;
            const human1 = await human('HUMAN1', 'helms');
            try {
                const atAttach = await decisions();
                await sleep(5_000);
                expect(admin.state.bots.get('GVTS')?.seats.get('pilot')?.status).toBe('running');
                expect(await decisions()).toBeGreaterThan(atAttach);
                expect([...admin.state.stations.keys()].filter((id) => id.startsWith('BOT-'))).toEqual([]);
                expect(stationOf('HUMAN1')).toEqual({ shipId: 'GVTS', stationType: 'helms' });
            } finally {
                await admin.stopRecording();
                human1.destroy();
            }
        });

        it('seating a bot never detaches the clients on its screens', async () => {
            const human2 = await human('HUMAN2', 'weapons');
            try {
                admin.assignBot({ shipId: 'GVTS', seat: 'weapons', brain: 'reference' });
                await waitStatus(admin, 'GVTS', 'weapons', 'running');
                await sleep(1_000);
                expect(stationOf('HUMAN2')).toEqual({ shipId: 'GVTS', stationType: 'weapons' });
                expect(admin.state.stations.get('HUMAN2')?.connected).toBe(true);
            } finally {
                human2.destroy();
            }
        });
    });

    it('a late recording gets events and none after stop', async () => {
        admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' });
        await waitStatus(admin, 'GVTS', 'pilot', 'running');
        await sleep(3_000);
        const name = await admin.startRecording();
        await sleep(5_000);
        const summary = await admin.stopRecording();
        const sidecar = path.join(gameDriver.recordingsDir, name.slice(0, -'.sgr'.length) + EVENTS_EXT);
        const sizeAtStop = (await fs.stat(sidecar)).size;
        await sleep(3_000);
        expect((await fs.stat(sidecar)).size).toBe(sizeAtStop);
        expect(summary?.events).toBe(path.basename(sidecar));
        const events = await readEvents(sidecar);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((e) => e !== null)).toBe(true);
        const kinds = new Set(events.map((e) => e?.kind));
        expect(kinds).toContain('brain_request');
        expect(kinds).toContain('decision');
        const maxT = Math.max(...events.map((e) => e?.t ?? Infinity));
        expect(maxT).toBeLessThanOrEqual((summary?.durationSeconds ?? 0) + 1);
    });
});
