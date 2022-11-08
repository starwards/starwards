import { ClientStatus, Destructors, ShipDriver, Status, StatusInfo } from '@starwards/core';
import { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';

import { Event } from 'colyseus-events';
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
export declare type Primitive = number | string | boolean | null | undefined;

function nodeLogic(node: ShipStateNode, { listenPattern, shipId }: ShipStateOptions) {
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

    node.on('input', (msg, _, done) => {
        void (async () => {
            if (!node.shipDriver) {
                done?.(new Error(`can't handle commands while in status: ${(await statusTracker.getStatus()).text}`));
            } else {
                try {
                    (await node.shipDriver).sendJsonCmd(msg.topic as string, msg.payload as Primitive);
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
