import { Flows, getNode, initNodes } from '../test-driver';

import { NodeStatus } from 'node-red';
import { ShipReadNode } from './ship-read';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

describe('ship-read dynamic subscribe', () => {
    const gameDriver = makeDriver();

    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
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

    it('emits current value immediately on subscribe', async () => {
        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = 42;
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);
        const eventPromise = waitForOutput({ topic: '/magazine/capacity', payload: 42 });
        node.receive({ topic: '/magazine/capacity', subscribe: true });
        await eventPromise;
    });

    it('emits future state changes after subscribe', async () => {
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);

        // Subscribe to the path
        node.receive({ topic: '/magazine/capacity', subscribe: true });

        // Wait for the immediate emit
        await waitForOutput({ topic: '/magazine/capacity', payload: expect.any(Number) });

        // Now change the value
        const eventPromise = waitForOutput({ topic: '/magazine/capacity', payload: 99 });
        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = 99;
        await eventPromise;
    });

    it('is idempotent — subscribing twice does not double-emit state changes', async () => {
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);

        // Subscribe twice to same topic
        node.receive({ topic: '/magazine/capacity', subscribe: true });
        node.receive({ topic: '/magazine/capacity', subscribe: true });

        // Wait for both immediate emits
        await waitForOutput({ topic: '/magazine/capacity', payload: expect.any(Number) });

        // Collect outputs triggered by a single state change
        const outputs: unknown[] = [];
        const origSend = node.send.bind(node);
        node.send = (msg) => {
            if (Array.isArray(msg)) {
                for (const m of msg.flat()) {
                    if (m && (m as { topic?: string }).topic === '/magazine/capacity') {
                        outputs.push(m);
                    }
                }
            } else if (msg && (msg as { topic?: string }).topic === '/magazine/capacity') {
                outputs.push(msg);
            }
            origSend(msg);
        };

        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = 77;
        await waitForOutput({ topic: '/magazine/capacity', payload: 77 });

        // Should emit exactly once for a single state change despite two subscribe calls
        expect(outputs.length).toBe(1);
    });

    it('is additive — subscribes to multiple topics independently', async () => {
        const flows: Flows = [
            { id: 'n0', type: 'starwards-config', url: gameDriver.url() },
            { id: 'n1', type: 'ship-read', shipId: test_map_1.testShipId, configNode: 'n0' },
        ];
        await helper.load(initNodes, flows);
        const { node, waitForOutput, waitForStatus } = getNode<ShipReadNode>('n1');
        await waitForStatus(expect.objectContaining({ fill: 'green', text: 'connected' }) as NodeStatus);

        node.receive({ topic: '/magazine/capacity', subscribe: true });
        node.receive({ topic: '/magazine/count_HiExpShell', subscribe: true });

        await waitForOutput({ topic: '/magazine/capacity', payload: expect.any(Number) });
        await waitForOutput({ topic: '/magazine/count_HiExpShell', payload: expect.any(Number) });

        const capacityPromise = waitForOutput({ topic: '/magazine/capacity', payload: 55 });
        gameDriver.getShip(test_map_1.testShipId).state.magazine.capacity = 55;
        await capacityPromise;

        const countPromise = waitForOutput({ topic: '/magazine/count_HiExpShell', payload: 12 });
        gameDriver.getShip(test_map_1.testShipId).state.magazine.count_HiExpShell = 12;
        await countPromise;
    });
});
