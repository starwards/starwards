import { BotSeats } from '../admin/game-manager';
import { BotSupervisor } from './supervisor';
import { GameStatus } from '@starwards/core/internal';
import { makeDriver } from '../test/driver';
import { two_vs_one } from '../maps';

const until = async (cond: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error(`condition not met within ${ms}ms`);
        await new Promise((r) => setTimeout(r, 50));
    }
};

describe('bot supervisor', () => {
    jest.setTimeout(40_000);
    const gameDriver = makeDriver();
    let supervisor: BotSupervisor;
    let original: BotSeats;
    const manager = () => gameDriver.gameManager;
    const assign = (shipId: string, seat: string, brain: string) => {
        manager().state.assignBotCommands.push({ shipId, seat, brain });
        manager().update(0);
    };
    const entry = (shipId: string, seat: string) => manager().state.bots.get(shipId)?.seats.get(seat);
    const install = (source?: () => string) => {
        supervisor = new BotSupervisor(
            manager(),
            () => gameDriver.url(),
            () => {},
            source,
        );
        original = manager().botSeats;
        manager().botSeats = supervisor;
    };

    beforeEach(async () => {
        await manager().startGame(two_vs_one);
    });
    afterEach(async () => {
        await supervisor.stopAll();
        manager().botSeats = original;
    });

    it('runs every seat of a ship in one worker and retires it with the last seat', async () => {
        install();
        assign('GVTS', 'pilot', 'reference');
        expect(supervisor.workerCount).toBe(1);
        await until(() => entry('GVTS', 'pilot')?.status === 'running', 10_000);
        assign('GVTS', 'weapons', 'reference');
        expect(supervisor.workerCount).toBe(1);
        await until(() => entry('GVTS', 'weapons')?.status === 'running', 10_000);

        assign('GVTS', 'pilot', 'none');
        expect(supervisor.workerCount).toBe(1);
        assign('GVTS', 'weapons', 'none');
        expect(supervisor.workerCount).toBe(0);
        const started = Date.now();
        await supervisor.stopAll(); // awaits the retiring worker's exit
        expect(Date.now() - started).toBeLessThan(5_000);
    });

    it('fails every bot of a ship whose worker throws, without restarting it', async () => {
        install(() => "require('node:worker_threads').parentPort.once('message', () => { throw new Error('boom'); })");
        assign('GVTS', 'pilot', 'reference');
        assign('GVTS', 'weapons', 'reference');
        await until(() => entry('GVTS', 'pilot')?.status === 'failed', 10_000);
        expect(entry('GVTS', 'pilot')?.message).toContain('boom');
        expect(entry('GVTS', 'weapons')?.status).toBe('failed');
        expect(entry('GVTS', 'weapons')?.message).toContain('boom');
        expect(manager().state.gameStatus).toBe(GameStatus.RUNNING);
        await new Promise((r) => setTimeout(r, 2_000));
        expect(supervisor.workerCount).toBe(0);
    });

    it('stops the workers of every ship', async () => {
        install();
        assign('GVTS', 'pilot', 'reference');
        assign('GVTS2', 'pilot', 'reference');
        expect(supervisor.workerCount).toBe(2);
        await until(() => entry('GVTS2', 'pilot')?.status === 'running', 10_000);
        await supervisor.stopAll();
        expect(supervisor.workerCount).toBe(0);
    });
});
