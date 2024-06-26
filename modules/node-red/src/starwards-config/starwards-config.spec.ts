import { Driver, GameStatus, waitFor } from '@starwards/core';
import { Flows, getNode, initNodes } from '../test-driver';

import { StarwardsConfigNode } from './starwards-config';
import helper from 'node-red-node-test-helper';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;
const FAKE_URL = 'http://127.1.2.3/';

describe('starwards-config', () => {
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
        const flows: Flows = [{ id: 'n1', type: 'starwards-config', url: FAKE_URL }];
        await helper.load(initNodes, flows);
        const { node } = getNode<StarwardsConfigNode>('n1');
        expect(node.driver).toBeInstanceOf(Driver);
    });

    describe('integration with server', () => {
        const gameDriver = makeDriver();

        afterEach(async () => {
            await helper.unload();
        });

        it('detects game status', async () => {
            const flows: Flows = [{ id: 'n1', type: 'starwards-config', url: gameDriver.url() }];
            await helper.load(initNodes, flows);
            const { node } = getNode<StarwardsConfigNode>('n1');
            expect(await node.driver.getGameStatus()).toEqual(GameStatus.STOPPED);
            await gameDriver.gameManager.startGame(test_map_1);
            await waitFor(async () => {
                expect(await node.driver.getGameStatus()).toEqual(GameStatus.RUNNING);
            }, 3_000);
        });
    });
});
