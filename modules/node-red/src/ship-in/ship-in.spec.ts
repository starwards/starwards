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

async function load(flows: Flows) {
    await helper.load(initNodes, flows);
    const node = helper.getNode('n1') as ShipInNode & SpiedNode;
    expect(node).toBeTruthy();
    async function waitForStatus(expected: Partial<NodeStatus>, timeout = 5_000): Promise<void> {
        const startTime = Date.now();
        try {
            expect(node.status.callCount).toBeGreaterThan(0);
            expect(node.status.lastCall.firstArg).toEqual(expected);
            return;
        } catch (e) {
            if (timeout < 0) {
                throw e;
            }
            await setTimeout(20);
            return waitForStatus(expected, timeout - (Date.now() - startTime));
        }
    }
    return { node, waitForStatus };
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
        const { waitForStatus } = await load(flows);
        await waitForStatus({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
    });

    describe('integration with starwards-config', () => {
        it('reports connection issue', async () => {
            const flows: Flows = [
                { id: 'n0', type: 'starwards-config', url: 'http://localhost/' },
                { id: 'n1', type: 'ship-in', shipId: 'GVTS', pattern: '**', configNode: 'n0', checkEvery: 10 },
            ];
            const { waitForStatus } = await load(flows);
            await waitForStatus({ fill: 'red', shape: 'ring', text: 'err:connect ECONNREFUSED ::1:80' });
        });
    });
});
