import { Node, NodeDef, NodeInitializer } from 'node-red';

import { Driver } from '@starwards/core';

export interface StarwardsConfigOptions {
    url: string;
}

export interface StarwardsConfigNode extends Node {
    driver: Driver;
}
const nodeInit: NodeInitializer = (RED): void => {
    function StarwardsConfigNodeConstructor(this: StarwardsConfigNode, config: NodeDef & StarwardsConfigOptions): void {
        RED.nodes.createNode(this, config);
        this.driver = new Driver(new URL(config.url));
    }

    RED.nodes.registerType('starwards-config', StarwardsConfigNodeConstructor);
};

export default nodeInit;
