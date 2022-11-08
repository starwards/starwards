import { ClientStatus, Destructors, ShipDriver, Status, StatusInfo, getJsonPointer } from '@starwards/core';
import { Event, isPrimitive } from 'colyseus-events';
import { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';

import { StarwardsConfigNode } from '../starwards-config/starwards-config';

export interface ShipStateOptions {
    configNode: string;
    shipId: string;
    listenPattern?: string;
}
export interface ShipStateNode extends Node {
    configNode: StarwardsConfigNode;
    cleanups: Destructors;
    shipDriver: Promise<ShipDriver> | null;
    listeningOnEvents: boolean;
}

export interface InputMessage {
    read: boolean;
}
export function isInputMessage(msg: unknown): msg is InputMessage {
    return !!(msg && typeof msg === 'object') && typeof (msg as InputMessage).read === 'boolean';
}
export function nodeLogic(node: ShipStateNode, { listenPattern, shipId }: ShipStateOptions) {
    const handleStateEvent = (e: Event) => {
        node.send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value } as NodeMessage);
    };
    const shipListenerCleanup = node.cleanups.child();
    const statusTracker = new ClientStatus(node.configNode.driver, shipId);
    let statusCounter = Number.MIN_SAFE_INTEGER;
    const onStatus = async ({ status, text }: StatusInfo): Promise<void> => {
        const currCOunter = ++statusCounter;
        if (status === Status.SHIP_FOUND) {
            if (!node.shipDriver) {
                node.shipDriver = node.configNode.driver.getShipDriver(shipId);
                node.shipDriver.then(
                    () => {
                        if (currCOunter === statusCounter) {
                            // latest call to getShipDriver() resolved succesfully
                            node.status({ fill: 'green', shape: 'dot', text: 'connected' });
                        }
                    },
                    (e) => {
                        if (currCOunter === statusCounter) {
                            // latest call to getShipDriver() failed
                            node.status({ fill: 'red', shape: 'dot', text: String(e) });
                            shipListenerCleanup.cleanup();
                            node.shipDriver = null;
                        }
                    }
                );
            }
            if (listenPattern && !node.listeningOnEvents) {
                const shipDriver = await node.shipDriver;
                shipListenerCleanup.add(() => {
                    node.listeningOnEvents = false;
                    shipDriver.events.off(listenPattern, handleStateEvent);
                });
                shipDriver.events.on(listenPattern, handleStateEvent);
                node.listeningOnEvents = true;
            }
        } else {
            node.shipDriver = null;
            shipListenerCleanup.cleanup();
            node.status({ fill: 'red', shape: 'dot', text });
        }
    };
    node.cleanups.add(statusTracker.onStatusChange(onStatus));

    node.on('input', (msg, send, done) => {
        void (async () => {
            if (!node.shipDriver) {
                done?.(new Error(`can't handle commands while in status: ${(await statusTracker.getStatus()).text}`));
            } else {
                try {
                    if (typeof msg.topic === 'string' && msg.topic) {
                        if (isPrimitive(msg.payload)) {
                            (await node.shipDriver).sendJsonCmd(msg.topic, msg.payload);
                        } else if (isInputMessage(msg.payload) && msg.payload.read) {
                            const pointer = getJsonPointer(msg.topic);
                            if (pointer) {
                                const payload = pointer.get((await node.shipDriver).state);
                                send({ topic: msg.topic, payload });
                            } else {
                                node.warn(`${msg.topic} is not a legal json pointer`);
                            }
                        }
                    }
                    done?.();
                } catch (e) {
                    done?.(e as Error);
                }
            }
        })();
    });
}

const nodeInit: NodeInitializer = (RED): void => {
    function ShipStateNodeConstructor(this: ShipStateNode, config: NodeDef & ShipStateOptions): void {
        RED.nodes.createNode(this, config);
        this.shipDriver = null;
        this.listeningOnEvents = false;
        this.cleanups = new Destructors();
        this.on('close', this.cleanups.destroy);
        const configNode = RED.nodes.getNode(config.configNode) as StarwardsConfigNode | undefined;
        if (configNode) {
            this.configNode = configNode;
            nodeLogic(this, config);
        } else {
            this.status({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
        }
    }

    RED.nodes.registerType('ship-state', ShipStateNodeConstructor);
};

export default nodeInit;
