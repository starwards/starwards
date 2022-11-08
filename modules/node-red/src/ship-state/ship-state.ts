import { ClientStatus, Destructors, Status, StatusInfo } from '@starwards/core';
import { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';

import { Event } from 'colyseus-events';
import { StarwardsConfigNode } from '../starwards-config/starwards-config';

export interface ShipStateOptions {
    configNode: string;
    shipId: string;
    pattern: string;
}
export interface ShipStateNode extends Node {
    configNode: StarwardsConfigNode;
    cleanups: Destructors;
    listeningOnEvents: boolean;
}

function nodeLogic(node: ShipStateNode, { pattern, shipId }: ShipStateOptions) {
    const handleStateEvent = (e: Event) => {
        node.send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value } as NodeMessage);
    };
    const shipListenerCleanup = node.cleanups.child();
    const statusTracker = new ClientStatus(node.configNode.driver, shipId);
    const onStatus = async ({ status, text }: StatusInfo): Promise<void> => {
        if (status === Status.SHIP_FOUND) {
            if (!node.listeningOnEvents) {
                const shipDriver = await node.configNode.driver.getShipDriver(shipId);
                shipListenerCleanup.add(() => {
                    node.listeningOnEvents = false;
                    shipDriver.events.off(pattern, handleStateEvent);
                });
                shipDriver.events.on(pattern, handleStateEvent);
                node.listeningOnEvents = true;
            }
            node.status({ fill: 'green', shape: 'dot', text: 'connected' });
        } else {
            shipListenerCleanup.cleanup();
            node.status({ fill: 'red', shape: 'dot', text });
        }
    };
    node.cleanups.add(statusTracker.onStatusChange(onStatus));
}

const nodeInit: NodeInitializer = (RED): void => {
    function ShipStateNodeConstructor(this: ShipStateNode, config: NodeDef & ShipStateOptions): void {
        RED.nodes.createNode(this, config);
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
