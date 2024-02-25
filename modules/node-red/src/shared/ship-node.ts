import { ClientStatus, Destructors, ShipDriver, Status, StatusInfo } from '@starwards/core';
import { Node, NodeAPI, NodeDef, NodeMessage, NodeMessageInFlow } from 'node-red';

import { StarwardsConfigNode } from '../starwards-config/starwards-config';

export interface ShipOptions {
    configNode: string;
    shipId: string;
}
export interface ShipNode extends Node {
    configNode: StarwardsConfigNode;
    cleanups: Destructors;
}

export type Send = (msg: NodeMessage | Array<NodeMessage | NodeMessage[] | null>) => void;

/**
 * parent node for nodes that are bound to specific ship
 */
export function createShipNode(
    RED: NodeAPI,
    node: ShipNode,
    options: NodeDef & ShipOptions,
    handleShipFound: null | ((shipDriver: ShipDriver) => () => unknown),
    handleInput: (shipDriver: ShipDriver, msg: NodeMessageInFlow, send: Send) => void,
) {
    node.cleanups = new Destructors();
    node.on('close', node.cleanups.destroy);
    const configNode = RED.nodes.getNode(options.configNode) as StarwardsConfigNode | undefined;
    if (configNode) {
        node.configNode = configNode;
        const shipHandlerCleanup = node.cleanups.child();
        const statusTracker = new ClientStatus(node.configNode.driver, options.shipId);
        let statusCounter = Number.MIN_SAFE_INTEGER;
        let shipDriver: Promise<ShipDriver> | null = null;
        let shipFoundHandled = false;
        node.cleanups.add(
            statusTracker.onStatusChange(async ({ status, text }: StatusInfo): Promise<void> => {
                const currCOunter = ++statusCounter;
                if (status === Status.SHIP_FOUND) {
                    if (!shipDriver) {
                        shipDriver = node.configNode.driver.getShipDriver(options.shipId);
                        shipDriver.then(
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
                                    shipHandlerCleanup.cleanup();
                                    shipDriver = null;
                                }
                            },
                        );
                    }
                    if (handleShipFound && !shipFoundHandled) {
                        shipFoundHandled = true;
                        shipHandlerCleanup.add(() => {
                            shipFoundHandled = false;
                        });
                        shipHandlerCleanup.add(handleShipFound(await shipDriver));
                    }
                } else {
                    shipDriver = null;
                    shipHandlerCleanup.cleanup();
                    node.status({ fill: 'red', shape: 'dot', text });
                }
            }),
        );
        node.on('input', (msg, send, done) => {
            void (async () => {
                if (!shipDriver) {
                    done?.(
                        new Error(`can't handle commands while in status: ${(await statusTracker.getStatus()).text}`),
                    );
                } else {
                    try {
                        handleInput(await shipDriver, msg, send);
                        done?.();
                    } catch (e) {
                        done?.(e as Error);
                    }
                }
            })();
        });
    } else {
        node.status({ fill: 'red', shape: 'ring', text: 'Server config missing or inactive' });
    }
}
