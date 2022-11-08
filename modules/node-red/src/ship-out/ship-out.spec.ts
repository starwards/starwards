import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipOutNode } from './ship-out';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';
import { waitFor } from '@starwards/core';

const { test_map_1 } = maps;
const FAKE_URL = 'http://127.1.2.3:8123/';

describe('ship-out', () => {
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
        const flows: Flows = [{ id: 'n1', type: 'ship-out', shipId: 'GVTS', configNode: 'n0' }];
        await helper.load(initNodes, flows);
        const { waitForStatus } = getNode('n1');
        await waitForStatus({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
    });

    describe('integration with starwards-config', () => {
        it('reports connection issue', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: FAKE_URL },
                { id: 'n1', type: 'ship-out', shipId: 'GVTS', configNode: 'n0' },
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

        afterEach(async () => {
            await helper.unload();
        });

        it('detects game status', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-out', shipId: test_map_1.testShipId, configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode<ShipOutNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        });

        it('relay ship state commands', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-out', shipId: test_map_1.testShipId, configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { node, waitForStatus } = getNode<ShipOutNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
            const eventPromise = waitFor(() => {
                expect(gameDriver.getShip('GVTS').state.magazine.count_CannonShell).toEqual(1234);
            }, 3_000);
            node.receive({ topic: '/magazine/count_CannonShell', payload: 1234 });
            await eventPromise;
        });
    });
});
