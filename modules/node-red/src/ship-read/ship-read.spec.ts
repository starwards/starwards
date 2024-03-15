import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipReadNode } from './ship-read';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

const testPayload = 0;
describe('ship-read', () => {
    const gameDriver = makeDriver();

    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
        // order matters
        await helper.unload();
        await new Promise<void>((done) => helper.stopServer(done));
        await helper.unload();
    });

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(test_map_1);
    });

    afterEach(async () => {
        await helper.unload();
    });

    it('queries state', async () => {
        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = testPayload;
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        const eventPromise = waitForOutput({ topic: '/magazine/capacity', payload: testPayload });
        node.receive({ topic: '/magazine/capacity', payload: { read: true } });
        await eventPromise;
    });

    it('reacts to ship state changes', async () => {
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, listenPattern: '**', configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        const eventPromise = waitForOutput({ topic: '/magazine/capacity', payload: testPayload });
        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = testPayload;
        await eventPromise;
    });
});
