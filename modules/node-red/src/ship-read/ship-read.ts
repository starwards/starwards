import { NodeDef, NodeInitializer, NodeMessageInFlow } from 'node-red';
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

        // Tracks dynamically subscribed patterns (additive, idempotent across the node lifetime)
        const dynamicPatterns = new Set<string>();

        const makeStateEventHandler = (send: Send) => (e: Event) => {
            send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value });
        };

        const handleInput = (shipDriver: ShipDriver, msg: NodeMessageInFlow, send: Send) => {
            if (typeof msg.topic === 'string' && msg.topic) {
                const isSubscribe = (msg as NodeMessageInFlow & { subscribe?: boolean }).subscribe === true;
                if (isSubscribe) {
                    // Dynamic subscription: additive and idempotent
                    const topic = msg.topic; // capture string for closures
                    if (!dynamicPatterns.has(topic)) {
                        dynamicPatterns.add(topic);
                        const handler = makeStateEventHandler(send);
                        shipDriver.events.on(topic, handler);
                        // Clean up on node close
                        this.cleanups.add(() => shipDriver.events.off(topic, handler));
                    }
                    // Immediate emit of current value (if exact JSON pointer)
                    const pointer = getJsonPointer(topic);
                    if (pointer) {
                        const payload = pointer.get(shipDriver.state);
                        send({ topic, payload });
                    }
                } else {
                    // Query once (original behavior)
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
            const cleanups: Array<() => void> = [];

            const addSubscription = (pattern: string, send: Send) => {
                const handler = makeStateEventHandler(send);
                shipDriver.events.on(pattern, handler);
                cleanups.push(() => shipDriver.events.off(pattern, handler));
            };

            // Re-apply dynamic subscriptions on reconnect using this.send as the send fn
            for (const pattern of dynamicPatterns) {
                addSubscription(pattern, (msg) => this.send(msg));
            }

            if (listenPattern) {
                addSubscription(listenPattern, (msg) => this.send(msg));
            }

            return () => {
                for (const cleanup of cleanups) cleanup();
            };
        };

        createShipNode(RED, this, options, handleShipFound, handleInput);
    }

    RED.nodes.registerType('ship-read', ShipReadNodeConstructor);
};

export default nodeInit;
