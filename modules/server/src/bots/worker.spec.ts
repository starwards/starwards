import { FromWorker, ToWorker, WorkerInit } from './protocol';
import { Worker } from 'node:worker_threads';
import { botWorkerSource } from './worker-source';
import { makeDriver } from '../test/driver';
import { training_t0 } from '../maps';

describe('bot worker', () => {
    jest.setTimeout(30_000);
    const gameDriver = makeDriver();

    it('runs a seated bot, posts events while recording and stops on request', async () => {
        await gameDriver.gameManager.startGame(training_t0);
        const worker = new Worker(botWorkerSource(), {
            eval: true,
            workerData: { baseUrl: gameDriver.url(), shipId: 'GVTS' } satisfies WorkerInit,
        });
        const exited = new Promise<number>((resolve) => worker.once('exit', resolve));
        const post = (m: ToWorker) => worker.postMessage(m);
        const next = (match: (m: FromWorker) => boolean, what: string) =>
            new Promise<FromWorker>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`no ${what} within 15s`)), 15_000);
                const onMessage = (m: FromWorker) => {
                    if (match(m)) {
                        clearTimeout(timer);
                        worker.off('message', onMessage);
                        resolve(m);
                    }
                };
                worker.on('message', onMessage);
                worker.once('error', (e: Error) => (clearTimeout(timer), reject(e)));
            });
        try {
            const running = next((m) => m.type === 'status', 'status');
            post({ type: 'seat', seat: 'pilot', botId: 'bot-pilot-1', brain: 'reference' });
            expect(await running).toEqual({
                type: 'status',
                seat: 'pilot',
                botId: 'bot-pilot-1',
                status: 'running',
                message: undefined,
            });
            const decision = next((m) => m.type === 'event' && m.kind === 'decision', 'decision event');
            post({ type: 'record', on: true });
            expect(await decision).toMatchObject({ type: 'event', kind: 'decision', objectId: 'GVTS' });
            const stopped = next((m) => m.type === 'stopped', 'stopped');
            post({ type: 'stop' });
            await stopped;
            expect(await exited).toBe(0);
        } finally {
            await worker.terminate();
        }
    });
});
