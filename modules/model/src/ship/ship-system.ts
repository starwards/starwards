import { MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export enum ShipAreas {
    front,
    rear,
    SHIP_AREAS_COUNT,
}

export class ShipSystem extends Schema {
    @type('boolean')
    broken = false;

    @type('int8')
    damageArea!: ShipAreas;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    // dps at which there's 50% chance of system destruction
    get dps50() {
        return getConstant(this.constants, 'dps50');
    }
}
