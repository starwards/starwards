import { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';

import { Destructors } from '@starwards/core';
import { Event } from 'colyseus-events';
import { StarwardsConfigNode } from '../starwards-config/starwards-config';

export interface ShipInOptions {
    configNode: string;
    shipId: string;
    pattern: string;
}
export interface ShipInNode extends Node {
    configNode: StarwardsConfigNode;
    cleanups: Destructors;
    listeningOnEvents: boolean;
}

function nodeLogic(node: ShipInNode, { pattern, shipId }: ShipInOptions) {
    const handleStateEvent = (e: Event) => {
        node.send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value } as NodeMessage);
    };
    const listenOnEvents = async () => {
        if (!node.listeningOnEvents) {
            const shipDriver = await node.configNode.driver.getShipDriver(shipId);
            shipListenerCleanup.add(() => {
                node.listeningOnEvents = false;
                shipDriver.events.off(pattern, handleStateEvent);
            });
            shipDriver.events.on(pattern, handleStateEvent);
            node.listeningOnEvents = true;
        }
    };

    let checking = false;
    const shipListenerCleanup = node.cleanups.child();
    const checkStatus = async () => {
        if (checking) return;
        checking = true;
        try {
            if (!(await node.configNode.driver.isActiveGame())) {
                node.status({ fill: 'red', shape: 'dot', text: 'no active game' });
                shipListenerCleanup.cleanup();
            } else if (!(await node.configNode.driver.doesShipExist(shipId))) {
                node.status({ fill: 'red', shape: 'ring', text: 'no ship found' });
                shipListenerCleanup.cleanup();
            } else {
                await listenOnEvents();
                node.status({ fill: 'green', shape: 'dot', text: 'connected' });
            }
        } finally {
            checking = false;
        }
    };
    const connectionStatus = node.configNode.driver.connectionStatus;
    node.cleanups.onEvent(connectionStatus, 'connecting', () => {
        const text = node.configNode.driver.errorMessage;
        if (text) {
            node.status({ fill: 'red', shape: 'dot', text });
        } else {
            node.status({ fill: 'blue', shape: 'ring', text: 'connecting' });
        }
    });
    node.cleanups.onEvent(connectionStatus, 'connected', () => {
        node.status({ fill: 'blue', shape: 'ring', text: 'connected' });
        void checkStatus();
        node.cleanups.add(node.configNode.driver.onGameStateChange(checkStatus));
    });
    node.cleanups.onEvent(connectionStatus, 'exit:connected', () => {
        shipListenerCleanup.cleanup();
        const text = node.configNode.driver.errorMessage || 'not connected to server';
        node.status({ fill: 'red', shape: 'dot', text });
    });
    node.cleanups.onEvent(connectionStatus, 'error', () => {
        const text = node.configNode.driver.errorMessage || 'unknown error';
        node.status({ fill: 'red', shape: 'dot', text });
    });
}

const nodeInit: NodeInitializer = (RED): void => {
    function ShipInNodeConstructor(this: ShipInNode, config: NodeDef & ShipInOptions): void {
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

    RED.nodes.registerType('ship-in', ShipInNodeConstructor);
};

export default nodeInit;
