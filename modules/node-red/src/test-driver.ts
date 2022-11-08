import { Node, NodeDef, NodeInitializer, NodeMessage, NodeStatus } from 'node-red';
import helper, { TestFlowsItem } from 'node-red-node-test-helper';
import shipInConfigNode, { ShipInOptions } from './ship-in/ship-in';
import shipOutConfigNode, { ShipOutOptions } from './ship-out/ship-out';
import shipStateConfigNode, { ShipStateOptions } from './ship-state/ship-state';
import starwardsConfigNode, { StarwardsConfigOptions } from './starwards-config/starwards-config';

import { SinonSpy } from 'sinon';
import { waitFor } from '@starwards/core';

type SpiedNode = {
    trace: SinonSpy;
    debug: SinonSpy;
    warn: SinonSpy;
    log: SinonSpy;
    status: SinonSpy;
};
type StarwardsConfigFlowItem = { type: 'starwards-config' } & TestFlowsItem<NodeDef & StarwardsConfigOptions>;
type ShipInFlowItem = { type: 'ship-in' } & TestFlowsItem<NodeDef & ShipInOptions>;
type ShipOutFlowItem = { type: 'ship-out' } & TestFlowsItem<NodeDef & ShipOutOptions>;
type ShipStatetFlowItem = { type: 'ship-state' } & TestFlowsItem<NodeDef & ShipStateOptions>;
export type Flows = Array<
    ShipInFlowItem | ShipOutFlowItem | ShipStatetFlowItem | StarwardsConfigFlowItem | TestFlowsItem
>;
export const initNodes: NodeInitializer = async (NODE) => {
    await starwardsConfigNode(NODE);
    await shipInConfigNode(NODE);
    await shipOutConfigNode(NODE);
    await shipStateConfigNode(NODE);
};

helper.init(require.resolve('node-red'));

export function getNode<T extends Node = Node>(id: string) {
    const node = helper.getNode(id) as T & SpiedNode;
    expect(node).toBeTruthy();
    const output: NodeMessage[] = [];
    node.send = (msg?: NodeMessage | Array<NodeMessage | NodeMessage[] | null>) => {
        if (Array.isArray(msg)) {
            for (const m of msg.flat()) {
                if (m) {
                    output.push(m);
                }
            }
        } else if (msg) {
            output.push(msg);
        }
    };
    return {
        node,
        waitForStatus: (expected: Partial<NodeStatus>) =>
            waitFor(() => {
                expect(node.status.callCount).toBeGreaterThan(0);
                expect(node.status.lastCall.firstArg).toEqual(expected);
            }, 3_000),
        waitForOutput: (msg: Partial<NodeMessage>) => {
            return waitFor(() => {
                expect(output).toEqual(expect.arrayContaining([msg]));
            }, 3_000);
        },
    };
}
