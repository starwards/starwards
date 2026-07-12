import { NodeDef, NodeInitializer, NodeMessageInFlow } from 'node-red';
import { Send, ShipNode, ShipOptions, createShipNode } from '../shared/ship-node';
import { ShipDriver, getJsonPointer } from '@starwards/core';

import { Event } from 'colyseus-events';

export interface ShipReadOptions extends ShipOptions {
    listenPattern?: string;
}
export interface ShipReadMessage extends NodeMessageInFlow {
    /** when true, dynamically subscribe to the topic instead of querying it once */
    subscribe?: boolean;
}
export type ShipReadNode = ShipNode;

const nodeInit: NodeInitializer = (RED): void => {
    function ShipReadNodeConstructor(this: ShipReadNode, options: NodeDef & ShipReadOptions): void {
        RED.nodes.createNode(this, options);

        // Tracks dynamically subscribed patterns (additive, idempotent across the node lifetime)
        const dynamicPatterns = new Set<string>();
        // Listener registrations for the CURRENT connection only. handleShipFound
        // resets it per connection, and dynamic subscribes push into it — a single
        // registry, so a pattern can never get two live handlers on one driver.
        let connectionCleanups: Array<() => void> = [];

        const makeStateEventHandler = (send: Send) => (e: Event) => {
            send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value });
        };

        const addSubscription = (shipDriver: ShipDriver, pattern: string) => {
            const handler = makeStateEventHandler((msg) => this.send(msg));
            shipDriver.events.on(pattern, handler);
            connectionCleanups.push(() => shipDriver.events.off(pattern, handler));
        };

        const handleInput = (shipDriver: ShipDriver, msg: ShipReadMessage, send: Send) => {
            if (typeof msg.topic === 'string' && msg.topic) {
                const isSubscribe = msg.subscribe === true;
                if (isSubscribe) {
                    // Dynamic subscription: additive and idempotent
                    const topic = msg.topic; // capture string for closures
                    if (!dynamicPatterns.has(topic)) {
                        dynamicPatterns.add(topic);
                        addSubscription(shipDriver, topic);
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
            connectionCleanups = [];

            // Re-apply dynamic subscriptions on reconnect
            for (const pattern of dynamicPatterns) {
                addSubscription(shipDriver, pattern);
            }

            if (listenPattern) {
                addSubscription(shipDriver, listenPattern);
            }

            const cleanups = connectionCleanups;
            return () => {
                for (const cleanup of cleanups) cleanup();
            };
        };

        createShipNode(RED, this, options, handleShipFound, handleInput);
    }

    RED.nodes.registerType('ship-read', ShipReadNodeConstructor);
};

export default nodeInit;
