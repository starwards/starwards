import { NodeDef, NodeInitializer, NodeMessage, NodeMessageInFlow } from 'node-red';
import { Send, ShipNode, ShipOptions, createShipNode } from '../shared/ship-node';
import { ShipDriver, getJsonPointer } from '@starwards/core';

import { Event } from 'colyseus-events';

export interface ShipReadOptions extends ShipOptions {
    listenPattern?: string;
}
export type ShipReadNode = ShipNode;

const nodeInit: NodeInitializer = (RED): void => {
    function ShipReadNodeConstructor(this: ShipReadNode, options: NodeDef & ShipReadOptions): void {
        RED.nodes.createNode(this, options);
        const handleInput = (shipDriver: ShipDriver, msg: NodeMessageInFlow, send: Send) => {
            if (typeof msg.topic === 'string' && msg.topic) {
                const pointer = getJsonPointer(msg.topic);
                if (pointer) {
                    const payload = pointer.get(shipDriver.state);
                    send({ topic: msg.topic, payload });
                } else {
                    this.warn(`${msg.topic} is not a legal json pointer`);
                }
            }
        };
        const handleShipFound = (shipDriver: ShipDriver) => {
            const { listenPattern } = options;
            if (listenPattern) {
                const handleStateEvent = (e: Event) => {
                    this.send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value } as NodeMessage);
                };
                shipDriver.events.on(listenPattern, handleStateEvent);
                return () => shipDriver.events.off(listenPattern, handleStateEvent);
            }
            return () => void 0;
        };
        createShipNode(RED, this, options, handleShipFound, handleInput);
    }

    RED.nodes.registerType('ship-read', ShipReadNodeConstructor);
};

export default nodeInit;
