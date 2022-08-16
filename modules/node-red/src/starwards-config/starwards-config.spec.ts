import { Flows, getNode, initNodes } from '../test-driver';

import { Driver } from '@starwards/core';
import { StarwardsConfigNode } from './starwards-config';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;

describe('starwards-config', () => {
    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
        await helper.unload();
        await new Promise<void>((done) => helper.stopServer(done));
    });

    it('loads', async () => {
        const flows: Flows = [{ id: 'n1', type: 'starwards-config', url: 'http://localhost/' }];
        await helper.load(initNodes, flows);
        const { node } = getNode<StarwardsConfigNode>('n1');
        expect(node.driver).toBeInstanceOf(Driver);
    });

    describe('integration with server', () => {
        const gameDriver = makeDriver();

        it('detects game status', async () => {
            const flows: Flows = [
                { id: 'n1', type: 'starwards-config', url: `http://localhost:${gameDriver.addressInfo.port}/` },
            ];
            await helper.load(initNodes, flows);
            const { node } = getNode<StarwardsConfigNode>('n1');
            expect(await node.driver.isActiveGame()).toEqual(false);
            await gameDriver.gameManager.startGame(test_map_1);
            expect(await node.driver.isActiveGame()).toEqual(true);
        });
    });
});
