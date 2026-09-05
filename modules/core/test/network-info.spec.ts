import { makeClient } from './driver';
import { makeDriver } from '@starwards/server/src/test/driver';

describe('Driver.getNetworkInfo', () => {
    const gameDriver = makeDriver();
    const clientDriver = makeClient(gameDriver.url);

    it('reports the port the server actually bound and at least one address', async () => {
        const info = await clientDriver.driver.getNetworkInfo();
        const boundPort = Number(new URL(gameDriver.url()).port);

        expect(info.port).toBe(boundPort);
        expect(info.addresses.length).toBeGreaterThan(0);
        expect(typeof info.addresses[0].address).toBe('string');
        expect(typeof info.addresses[0].url).toBe('string');
    });
});
