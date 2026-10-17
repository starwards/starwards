import { parentPort, workerData } from 'node:worker_threads';
import { Driver } from '@starwards/core/internal';

const port = parentPort!;
const driver = new Driver(new URL((workerData as { baseUrl: string }).baseUrl)).connect();
void (async () => {
    const admin = await driver.getAdminDriver();
    port.postMessage({ type: 'ready', gameStatus: admin.state.gameStatus });
})();
port.on('message', (m: { type: string }) => {
    if (m.type === 'stop') {
        driver.destroy();
        port.close();
    }
});
