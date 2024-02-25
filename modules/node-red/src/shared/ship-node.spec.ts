import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipNode } from './ship-node';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;
const FAKE_URL = 'http://127.1.2.3:8123/';

describe('ship-node', () => {
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
        const flows: Flows = [{ id: 'n1', type: 'ship-node-dummy', shipId: 'GVTS', configNode: 'n0' }];
        await helper.load(initNodes, flows);
        const { waitForStatus } = getNode('n1');
        await waitForStatus({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
    });

    describe('integration with starwards-config', () => {
        it('reports connection issue', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: FAKE_URL },
                { id: 'n1', type: 'ship-node-dummy', shipId: 'GVTS', configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode('n1');
            await waitForStatus(
                expect.objectContaining({
                    fill: 'red',
                    text: expect.stringContaining('ECONNREFUSED') as unknown,
                }) as NodeStatus,
            );
        });
    });

    describe('with server', () => {
        const gameDriver = makeDriver();

        beforeEach(async () => {
            await gameDriver.gameManager.startGame(test_map_1);
        });

        afterEach(async () => {
            await helper.unload();
        });

        it('detects game status ', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                {
                    id: 'n1',
                    type: 'ship-node-dummy',
                    shipId: test_map_1.testShipId,
                    configNode: 'n0',
                },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode<ShipNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        });

        it('handles input', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-node-dummy', shipId: test_map_1.testShipId, configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { node, waitForStatus, waitForOutput } = getNode<ShipNode>('n1');
            await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
            const eventPromise = waitForOutput({ topic: 'input' });
            node.receive({ topic: 'foo' });
            await eventPromise;
        });

        it('handles ship found', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
                { id: 'n1', type: 'ship-node-dummy', shipId: test_map_1.testShipId, configNode: 'n0' },
            ];
            await helper.load(initNodes, flows);
            const { waitForOutput } = getNode<ShipNode>('n1');
            await waitForOutput({ topic: 'found' });
        });
    });
});
