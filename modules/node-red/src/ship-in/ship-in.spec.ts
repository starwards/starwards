import { Flows, getNode, initNodes } from '../test-driver';

import { ShipInNode } from './ship-in';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

describe('ship-in', () => {
    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
        await helper.unload();
        await new Promise<void>((done) => helper.stopServer(done));
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
                { id: 'n0', type: 'starwards-config', url: 'http://localhost/' },
                { id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0', checkEvery: 10 },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode('n1');
            await waitForStatus({ fill: 'red', shape: 'ring', text: 'err:connect ECONNREFUSED ::1:80' });
        });
    });

    describe('integration with server', () => {
        const gameDriver = makeDriver();

        beforeEach(async () => {
            await gameDriver.gameManager.startGame(test_map_1);
        });

        it('detects game status ', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: `http://localhost:${gameDriver.addressInfo.port}/` },
                { id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0', checkEvery: 10 },
            ];
            await helper.load(initNodes, flows);
            const { waitForStatus } = getNode<ShipInNode>('n1');
            await waitForStatus({ fill: 'green', shape: 'dot', text: 'connected' });
        });

        it('sends ship state changes', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: `http://localhost:${gameDriver.addressInfo.port}/` },
                { id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0', checkEvery: 10 },
            ];
            await helper.load(initNodes, flows);
            const { waitForOutput, waitForStatus } = getNode<ShipInNode>('n1');
            await waitForStatus({ fill: 'green', shape: 'dot', text: 'connected' });
            gameDriver.getShip('GVTS').state.chainGunAmmo = 1234;
            await waitForOutput({ topic: '/chainGunAmmo', payload: 1234 });
        });
    });
});