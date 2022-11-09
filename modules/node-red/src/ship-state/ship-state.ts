import { Event, isPrimitive } from 'colyseus-events';
import { NodeDef, NodeInitializer, NodeMessage, NodeMessageInFlow } from 'node-red';
import { Send, ShipNode, ShipOptions, createShipNode } from '../shared/ship-node';
import { ShipDriver, getJsonPointer } from '@starwards/core';

export interface ShipStateOptions extends ShipOptions {
    listenPattern?: string;
}
export type ShipStateNode = ShipNode;

export interface InputMessage {
    read: boolean;
}
export function isInputMessage(msg: unknown): msg is InputMessage {
    return !!(msg && typeof msg === 'object') && typeof (msg as InputMessage).read === 'boolean';
}
const nodeInit: NodeInitializer = (RED): void => {
    function ShipStateNodeConstructor(this: ShipStateNode, options: NodeDef & ShipStateOptions): void {
        RED.nodes.createNode(this, options);
        const handleInput = (shipDriver: ShipDriver, msg: NodeMessageInFlow, send: Send) => {
            if (typeof msg.topic === 'string' && msg.topic) {
                if (isPrimitive(msg.payload)) {
                    shipDriver.sendJsonCmd(msg.topic, msg.payload);
                } else if (isInputMessage(msg.payload) && msg.payload.read) {
                    const pointer = getJsonPointer(msg.topic);
                    if (pointer) {
                        const payload = pointer.get(shipDriver.state);
                        send({ topic: msg.topic, payload });
                    } else {
                        this.warn(`${msg.topic} is not a legal json pointer`);
                    }
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

    RED.nodes.registerType('ship-state', ShipStateNodeConstructor);
};

export default nodeInit;
