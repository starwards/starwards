import { FromWorker, ToWorker, WorkerInit } from './protocol';
import { parentPort, workerData } from 'node:worker_threads';
import { Driver } from '@starwards/core/internal';
import { shipCrew } from './ship-crew';

const port = parentPort!;
const { baseUrl, shipId } = workerData as WorkerInit;
const send = (m: FromWorker) => port.postMessage(m);
const log = (level: 'info' | 'error', message: string) => send({ type: 'log', level, message });
const driver = new Driver(new URL(baseUrl)).connect();
const pending: ToWorker[] = [];
let crew: Awaited<ReturnType<typeof shipCrew>> | null = null;

async function handle(m: ToWorker) {
    if (!crew) {
        pending.push(m);
        return;
    }
    switch (m.type) {
        case 'seat':
            log('info', `${m.botId} seated on ${m.seat}`);
            return crew.addSeat(m.seat, m.botId, m.brain);
        case 'unseat':
            return crew.removeSeat(m.seat);
        case 'record':
            return crew.setRecording(m.on);
        case 'stop':
            await crew.stop();
            driver.destroy();
            send({ type: 'stopped' });
            port.close();
    }
}
port.on('message', (m: ToWorker) => void handle(m).catch((e: unknown) => log('error', String(e))));
void shipCrew({
    driver,
    baseUrl: new URL(baseUrl),
    shipId,
    emit: (e) => send({ type: 'event', ...e }),
    logError: (message) => log('error', message),
    onStatus: (seat, botId, status, message) => {
        if (status === 'failed') log('error', `${botId} on ${seat} failed: ${message ?? ''}`);
        send({ type: 'status', seat, botId, status, message });
    },
}).then(async (c) => {
    crew = c;
    for (const m of pending.splice(0)) await handle(m);
});
