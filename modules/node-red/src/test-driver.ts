import { Node, NodeDef, NodeInitializer, NodeMessage, NodeStatus } from 'node-red';
import helper, { TestFlowsItem } from 'node-red-node-test-helper';
import shipInConfigNode, { ShipInOptions } from './ship-in/ship-in';
import sinon, { SinonSpy } from 'sinon';
import starwardsConfigNode, { StarwardsConfigOptions } from './starwards-config/starwards-config';

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
export type Flows = Array<ShipInFlowItem | StarwardsConfigFlowItem | TestFlowsItem>;
export const initNodes: NodeInitializer = async (NODE) => {
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

export function getNode<T extends Node = Node>(id: string) {
    const node = helper.getNode(id) as T & SpiedNode;
    expect(node).toBeTruthy();
    sinon.spy(node, 'send');
    return {
        node,
        waitForStatus: (expected: Partial<NodeStatus>) =>
            waitFor(() => {
                expect(node.status.callCount).toBeGreaterThan(0);
                expect(node.status.lastCall.firstArg).toEqual(expected);
            }, 5_000),
        waitForOutput: (expected: Partial<NodeMessage>) =>
            waitFor(() => {
                expect(node.send.callCount).toBeGreaterThan(0);
                expect(node.send.calledWith(expected)).toEqual(true);
            }, 5_000),
    };
}
