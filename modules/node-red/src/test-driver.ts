import { Node, NodeDef, NodeInitializer, NodeMessage, NodeStatus } from 'node-red';
import helper, { TestFlowsItem } from 'node-red-node-test-helper';
import shipReadConfigNode, { ShipReadOptions } from './ship-read/ship-read';
import shipWriteConfigNode, { ShipWriteOptions } from './ship-write/ship-write';
import starwardsConfigNode, { StarwardsConfigOptions } from './starwards-config/starwards-config';

import { ShipOptions } from './shared/ship-node';
import { SinonSpy } from 'sinon';
import shipNodeDummy from './shared/ship-node-dummy';
import { waitFor } from '@starwards/core';

type SpiedNode = {
    trace: SinonSpy;
    debug: SinonSpy;
    warn: SinonSpy;
    log: SinonSpy;
    status: SinonSpy;
};
type StarwardsConfigFlowItem = { type: 'starwards-config' } & TestFlowsItem<NodeDef & StarwardsConfigOptions>;
type ShipNodeDummyFlowItem = { type: 'ship-node-dummy' } & TestFlowsItem<NodeDef & ShipOptions>;
type ShipReadFlowItem = { type: 'ship-read' } & TestFlowsItem<NodeDef & ShipReadOptions>;
type ShipWriteFlowItem = { type: 'ship-write' } & TestFlowsItem<NodeDef & ShipWriteOptions>;

export type Flows = Array<
    ShipReadFlowItem | ShipWriteFlowItem | StarwardsConfigFlowItem | TestFlowsItem | ShipNodeDummyFlowItem
>;
export const initNodes: NodeInitializer = async (NODE) => {
    await starwardsConfigNode(NODE);
    await shipNodeDummy(NODE);
    await shipReadConfigNode(NODE);
    await shipWriteConfigNode(NODE);
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
        waitForOutput: (msg: Partial<NodeMessage>) =>
            waitFor(() => {
                expect(output).toEqual(expect.arrayContaining([msg]));
            }, 3_000),
    };
}
