import { NodeDef, NodeInitializer, NodeMessageInFlow } from 'node-red';
import { Send, ShipNode, ShipOptions, createShipNode } from './ship-node';

import { ShipDriver } from '@starwards/core';

const nodeInit: NodeInitializer = (RED): void => {
    function ShipNodeDummyConstructor(this: ShipNode, options: NodeDef & ShipOptions): void {
        RED.nodes.createNode(this, options);
        const handleInput = (_d: ShipDriver, _m: NodeMessageInFlow, send: Send) => {
            send({ topic: 'input' });
        };
        const handleShipFound = (_: ShipDriver) => {
            this.send({ topic: 'found' });
            return () => void 0;
        };
        createShipNode(RED, this, options, handleShipFound, handleInput);
    }

    RED.nodes.registerType('ship-node-dummy', ShipNodeDummyConstructor);
};

export default nodeInit;
