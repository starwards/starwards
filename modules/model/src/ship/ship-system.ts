import { MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export enum ShipAreas {
    front,
    rear,
}

export class ShipSystem extends Schema {
    @type('boolean')
    broken = false;

    @type('int8')
    damageArea!: ShipAreas;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    damageSystem(hits = 1) {
        const damageProbability = getConstant(this.constants, 'damageProbability');
        for (let i = 0; i < hits; i++) {
            if (Math.random() <= damageProbability) {
                this.broken = true;
                break;
            }
        }
    }
}
