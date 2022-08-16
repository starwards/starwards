import { Node, NodeDef, NodeInitializer, NodeMessage } from 'node-red';

import { Destructors } from '@starwards/core';
import { ErrorCode } from 'colyseus.js';
import { Event } from 'colyseus-events';
import { StarwardsConfigNode } from '../starwards-config/starwards-config';
import { TaskLoop } from '../shared/task-loop';
import { isCoded } from '../shared/errors';

export interface ShipInOptions {
    configNode: string;
    shipId: string;
    pattern: string;
    checkEvery: number;
}
export interface ShipInNode extends Node {
    configNode: StarwardsConfigNode;
    destructors: Destructors;
    listeningOnEvents: boolean;
    disconnected: boolean;
    lastGameError: unknown;
}

function isErrorLike(e: unknown): e is { message: string } {
    return typeof (e as Error)?.message === 'string';
}
function handleError(node: ShipInNode) {
    const e = node.lastGameError;
    if (!e) {
        return false;
    }
    if (isCoded(e)) {
        if (e.code in ErrorCode) {
            node.status({ fill: 'red', shape: 'ring', text: ErrorCode[e.code] });
        } else {
            node.status({ fill: 'red', shape: 'ring', text: `code ${e.code}` });
        }
    } else if (e instanceof Error || isErrorLike(e)) {
        node.status({ fill: 'red', shape: 'ring', text: 'err:' + e.message });
    } else {
        node.status({ fill: 'red', shape: 'ring', text: JSON.stringify(e) });
    }
    return true;
}

function nodeLogic(node: ShipInNode, { pattern, shipId, checkEvery }: ShipInOptions) {
    const handleStateEvent = (e: Event) => {
        node.send({ topic: e.path, payload: e.op === 'remove' ? undefined : e.value } as NodeMessage);
    };
    const statusLoop = new TaskLoop(async () => {
        try {
            const activeGame = await node.configNode.driver.isActiveGame();
            if (!activeGame) {
                node.status({ fill: 'red', shape: 'dot', text: 'no active game' });
                node.disconnected = true;
                return;
            }
            const shipFound = await (async () => {
                for (const id of await node.configNode.driver.getCurrentShipIds()) {
                    if (shipId === id) return true;
                }
                return false;
            })();
            if (!shipFound) {
                node.status({ fill: 'red', shape: 'ring', text: 'no ship found' });
                node.disconnected = true;
                return;
            }
            if (node.listeningOnEvents) {
                if (node.disconnected) {
                    node.status({ fill: 'red', shape: 'dot', text: 're-deploy flow (no reconnect yet)' });
                } else {
                    node.status({ fill: 'green', shape: 'dot', text: 'connected' });
                }
                return;
            }
            node.status({ fill: 'blue', shape: 'ring', text: 'connecting' });
            node.lastGameError = null;
            const shipDriver = await node.configNode.driver.getShipDriver(shipId).catch((e: unknown) => {
                node.lastGameError = e;
            });
            if (handleError(node) || !shipDriver) {
                return;
            }
            node.destructors.add(() => shipDriver.events.off(pattern, handleStateEvent));
            shipDriver.events.on(pattern, handleStateEvent);
            node.listeningOnEvents = true;
            node.disconnected = false;
        } catch (e) {
            node.lastGameError = e;
        }
        handleError(node);
    }, checkEvery);

    statusLoop.start();
    node.destructors.add(statusLoop.stop);
}

const nodeInit: NodeInitializer = (RED): void => {
    function ShipInNodeConstructor(this: ShipInNode, config: NodeDef & ShipInOptions): void {
        RED.nodes.createNode(this, config);
        this.disconnected = true;
        this.listeningOnEvents = false;
        this.destructors = new Destructors();
        this.on('close', () => this.destructors.destroy());
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
