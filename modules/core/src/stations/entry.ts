import { Schema } from '@colyseus/schema';

import { gameField } from '../game-field';

/**
 * One station's registry entry: a physical seat's persistent identity, whether its owning
 * client is currently connected, and — once assigned — which ship and station type it is
 * bound to. Generic: knows nothing about ships or manifests (that validation is the
 * integration point's job, see `GameManager`). Empty `shipId`/`stationType` mean unassigned.
 */
export class StationRegistryEntry extends Schema {
    @gameField('string')
    id = '';

    @gameField('boolean')
    connected = false;

    @gameField('string')
    shipId = '';

    @gameField('string')
    stationType = '';
}
