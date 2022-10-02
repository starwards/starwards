import { ClientStatus, Destructors, ShipDriver, Status, StatusInfo } from '@starwards/core';
import { Node, NodeDef, NodeInitializer } from 'node-red';

import { StarwardsConfigNode } from '../starwards-config/starwards-config';

export interface ShipOutOptions {
    configNode: string;
    shipId: string;
}
export interface ShipOutNode extends Node {
    configNode: StarwardsConfigNode;
    cleanups: Destructors;
    shipDriver: Promise<ShipDriver> | null;
}
export declare type Primitive = number | string | boolean | null | undefined;

function nodeLogic(node: ShipOutNode, { shipId }: ShipOutOptions) {
    const statusTracker = new ClientStatus(node.configNode.driver, shipId);
    const onStatus = ({ status, text }: StatusInfo) => {
        if (status === Status.SHIP_FOUND) {
            node.status({ fill: 'green', shape: 'dot', text: 'connected' });
            if (!node.shipDriver) {
                node.shipDriver = node.configNode.driver.getShipDriver(shipId);
            }
        } else {
            node.shipDriver = null;
            node.status({ fill: 'red', shape: 'dot', text });
        }
    };
    node.on('input', (msg, _, done) => {
        void (async () => {
            if (!node.shipDriver) {
                done?.(new Error(`not relaying messages in state: ${(await statusTracker.getStatus()).text}`));
            } else {
                try {
                    (await node.shipDriver).setPrimitiveState(msg.topic as string, msg.payload as Primitive);
                    done?.();
                } catch (e) {
                    done?.(e as Error);
                }
            }
        })();
    });
    node.cleanups.add(statusTracker.onStatusChange(onStatus));
}

const nodeInit: NodeInitializer = (RED): void => {
    function ShipOutNodeConstructor(this: ShipOutNode, config: NodeDef & ShipOutOptions): void {
        RED.nodes.createNode(this, config);
        this.shipDriver = null;
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

    RED.nodes.registerType('ship-out', ShipOutNodeConstructor);
};

export default nodeInit;
