import { NodeDef, NodeInitializer, NodeMessageInFlow } from 'node-red';
import { ShipNode, ShipOptions, createShipNode } from '../shared/ship-node';

import { ShipDriver } from '@starwards/core';
import { isPrimitive } from 'colyseus-events';

export type ShipWriteOptions = ShipOptions;
export type ShipWriteNode = ShipNode;

const nodeInit: NodeInitializer = (RED): void => {
    function ShipWriteNodeConstructor(this: ShipWriteNode, options: NodeDef & ShipWriteOptions): void {
        RED.nodes.createNode(this, options);
        const handleInput = (shipDriver: ShipDriver, msg: NodeMessageInFlow) => {
            if (typeof msg.topic === 'string' && msg.topic) {
                if (isPrimitive(msg.payload)) {
                    shipDriver.sendJsonCmd(msg.topic, msg.payload);
                }
            }
        };
        createShipNode(RED, this, options, null, handleInput);
    }

    RED.nodes.registerType('ship-write', ShipWriteNodeConstructor);
};

export default nodeInit;
