import helper, { TestFlowsItem } from 'node-red-node-test-helper';
import starwardsConfigNode, { StarwardsConfigNode, StarwardsConfigOptions } from './starwards-config';

import { Driver } from '@starwards/core';
import { NodeDef } from 'node-red';
import { makeDriver } from '@starwards/server/src/test/driver';
import { maps } from '@starwards/server';

const { test_map_1 } = maps;
type FlowsItem = TestFlowsItem<NodeDef & StarwardsConfigOptions>;
type Flows = Array<FlowsItem>;

helper.init(require.resolve('node-red'));

describe('starwards-config', () => {
    beforeEach((done) => {
        helper.startServer(done);
    });

    afterEach(async () => {
        await helper.unload();
        await new Promise<void>((done) => helper.stopServer(done));
    });

    it('should be loaded', async () => {
        const flows: Flows = [{ id: 'n1', type: 'starwards-config', url: 'http://localhost/' }];
        await helper.load(starwardsConfigNode, flows);
        const n1 = helper.getNode('n1') as StarwardsConfigNode;
        expect(n1).toBeTruthy();
        expect(n1.driver).toBeInstanceOf(Driver);
    });

    describe('integration with server', () => {
        const gameDriver = makeDriver();

        it('detects game status', async () => {
            const flows: Flows = [
                { id: 'n1', type: 'starwards-config', url: `http://localhost:${gameDriver.addressInfo.port}/` },
            ];
            await helper.load(starwardsConfigNode, flows);
            const n1 = helper.getNode('n1') as StarwardsConfigNode;
            expect(await n1.driver.isActiveGame()).toEqual(false);
            await gameDriver.gameManager.startGame(test_map_1);
            expect(await n1.driver.isActiveGame()).toEqual(true);
        });
    });
});
