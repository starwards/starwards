import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipWriteNode } from './ship-write';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';
import { waitFor } from '@starwards/core';

const { test_map_1 } = maps;

describe('ship-write', () => {
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

    it('relay commands to server', async () => {
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-write', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForStatus } = getNode<ShipWriteNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        const eventPromise = waitFor(() => {
            expect(gameDriver.getShip('GVTS').state.magazine.count_CannonShell).toEqual(1234);
        }, 3_000);
        node.receive({ topic: '/magazine/count_CannonShell', payload: 1234 });
        await eventPromise;
    });
});
