import { MapSchema, Schema, type } from '@colyseus/schema';

import NormalDistribution from 'normal-distribution';
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

    damageSystem(damageFactor: number, exposureSeconds: number, hits = 1) {
        const dps50 = this.dps50;
        const dist = new NormalDistribution(dps50, dps50 / 2);
        const destructionProbability = dist.cdf(damageFactor / exposureSeconds);
        for (let i = 0; i < hits; i++) {
            if (Math.random() > destructionProbability) {
                this.broken = true;
                break;
            }
        }
    }
}
