import { NodeDef, NodeInitializer, NodeStatus } from 'node-red';
import helper, { TestFlowsItem } from 'node-red-node-test-helper';
import shipInConfigNode, { ShipInNode, ShipInOptions } from './ship-in';
import starwardsConfigNode, { StarwardsConfigOptions } from '../starwards-config/starwards-config';
import { SinonSpy } from 'sinon';
import { setTimeout } from 'timers/promises';

type SpiedNode = {
    trace: SinonSpy;
    debug: SinonSpy;
    warn: SinonSpy;
    log: SinonSpy;
    status: SinonSpy;
    send: SinonSpy;
};
type StarwardsConfigFlowItem = { type: 'starwards-config' } & TestFlowsItem<NodeDef & StarwardsConfigOptions>;
type ShipInFlowItem = { type: 'ship-in' } & TestFlowsItem<NodeDef & ShipInOptions>;
type Flows = Array<ShipInFlowItem | StarwardsConfigFlowItem>;
const initNodes: NodeInitializer = async (NODE) => {
    await starwardsConfigNode(NODE);
    await shipInConfigNode(NODE);
};
helper.init(require.resolve('node-red'));

async function waitFor<T>(body: () => T | Promise<T>, timeout: number): Promise<T> {
    let error: unknown = new Error('timeout is not a positive number');
    while (timeout > 0) {
        const startTime = Date.now();
        try {
            return await body();
        } catch (e) {
            error = e;
        }
        await setTimeout(20);
        timeout -= Date.now() - startTime;
    }
    throw error;
}

function getNode(id: string) {
    const node = helper.getNode(id) as ShipInNode & SpiedNode;
    expect(node).toBeTruthy();
    return {
        node,
        waitForStatus: (expected: Partial<NodeStatus>) =>
            waitFor(() => {
                expect(node.status.callCount).toBeGreaterThan(0);
                expect(node.status.lastCall.firstArg).toEqual(expected);
            }, 5_000),
    };
}

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
});
