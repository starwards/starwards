import { Node, NodeDef, NodeInitializer } from 'node-red';

import { Driver } from '@starwards/core';

export interface StarwardsConfigOptions {
    url: string;
}

export interface StarwardsConfigNode extends Node {
    driver: Driver;
}

// users often paste a bare host (e.g. `localhost:8080`) instead of a full URL.
// `new URL('localhost:8080')` parses that as protocol `localhost:` rather than throwing,
// so detect a missing scheme and default it to http://.
export function withDefaultProtocol(url: string): string {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `http://${url}`;
}

const nodeInit: NodeInitializer = (RED): void => {
    function StarwardsConfigNodeConstructor(this: StarwardsConfigNode, config: NodeDef & StarwardsConfigOptions): void {
        RED.nodes.createNode(this, config);
        this.driver = new Driver(new URL(withDefaultProtocol(config.url))).connect(1_000);
        this.on('close', () => this.driver.destroy());
    }

    RED.nodes.registerType('starwards-config', StarwardsConfigNodeConstructor);
};

export default nodeInit;
