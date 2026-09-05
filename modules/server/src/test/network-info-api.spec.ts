import { NetworkInfo } from '../network-info';
import { makeDriver } from './driver';
import supertest from 'supertest';

describe('GET /network-info', () => {
    const gameDriver = makeDriver();

    it('reports the actual bound port and at least one address', async () => {
        const response = await supertest(gameDriver.httpServer).get('/network-info').expect(200);
        const boundPort = new URL(gameDriver.url()).port;
        const body = response.body as NetworkInfo;
        expect(String(body.port)).toEqual(boundPort);
        expect(body.addresses.length).toBeGreaterThan(0);
        expect(typeof body.addresses[0].address).toBe('string');
        expect(typeof body.addresses[0].url).toBe('string');
    });
});
