import { GameManager } from '../admin/game-manager';
import { Worker } from 'node:worker_threads';
import { botWorkerSource } from './worker-source';
import { createLogger } from '@starwards/core/internal';
import { training_t0 } from '../maps';

const { info, error } = createLogger('server:bot-selftest');

/** `STARWARDS_BOT_SELFTEST=1`: start a game, connect a bot worker to this server, and exit 0 on its first message. */
export async function botWorkerSelfTest(manager: GameManager, port: number): Promise<never> {
    await manager.startGame(training_t0);
    const worker = new Worker(botWorkerSource(), { eval: true, workerData: { baseUrl: `http://localhost:${port}` } });
    const ok = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 15_000);
        worker.once('message', () => (clearTimeout(timer), resolve(true)));
        worker.once('error', (e) => (clearTimeout(timer), error(e), resolve(false)));
    });
    info(`bot worker selftest: ${ok ? 'ok' : 'FAILED'}`);
    await worker.terminate();
    return process.exit(ok ? 0 : 1);
}
