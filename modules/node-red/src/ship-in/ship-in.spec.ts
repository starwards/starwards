import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipInNode } from './ship-in';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;
const FAKE_URL = 'http://127.1.2.3/';

describe('ship-in', () => {
    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
        // order matters
        await helper.unload();
        await new Promise<void>((done) => helper.stopServer(done));
        await helper.unload();
    });

    it('loads', async () => {
        const flows: Flows = [{ id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0' }];
        await helper.load(initNodes, flows);
        const { waitForStatus } = getNode('n1');
        await waitForStatus({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
    });

    describe('integration with starwards-config', () => {
        it('reports connection issue', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: FAKE_URL },
                { id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode('n1');
            await waitForStatus(
                expect.objectContaining({
                    fill: 'red',
                    text: expect.stringContaining('ECONNREFUSED') as unknown,
                }) as NodeStatus
            );
        });
    });

    describe('integration with server', () => {
        const gameDriver = makeDriver();

        beforeEach(async () => {
            await gameDriver.gameManager.startGame(test_map_1);
            // gameDriver.pauseGameCommand();
        });

        it('detects game status ', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-in', shipId: test_map_1.testShipId, pattern: '**', configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode<ShipInNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        });

        it('sends ship state changes', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-in', shipId: test_map_1.testShipId, pattern: '**', configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForOutput, waitForStatus } = getNode<ShipInNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
            const eventPromise = waitForOutput({ topic: '/chainGunAmmo', payload: 1234 });
            gameDriver.getShip('GVTS').state.chainGunAmmo = 1234;
            await eventPromise;
        });
    });
});
