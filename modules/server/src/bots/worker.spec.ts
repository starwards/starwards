import { GameStatus } from '@starwards/core/internal';
import { Worker } from 'node:worker_threads';
import { botWorkerSource } from './worker-source';
import { makeDriver } from '../test/driver';
import { training_t0 } from '../maps';

describe('bot worker', () => {
    jest.setTimeout(30_000);
    const gameDriver = makeDriver();

    it('connects a driver to the server and stops on request', async () => {
        await gameDriver.gameManager.startGame(training_t0);
        const worker = new Worker(botWorkerSource(), { eval: true, workerData: { baseUrl: gameDriver.url() } });
        const exited = new Promise<number>((resolve) => worker.once('exit', resolve));
        try {
            const ready = await new Promise<unknown>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('no ready message within 10s')), 10_000);
                worker.once('message', (m) => (clearTimeout(timer), resolve(m)));
                worker.once('error', (e: Error) => (clearTimeout(timer), reject(e)));
            });
            expect(ready).toEqual({ type: 'ready', gameStatus: GameStatus.RUNNING });
            worker.postMessage({ type: 'stop' });
            expect(await exited).toBe(0);
        } finally {
            await worker.terminate();
        }
    });
});
