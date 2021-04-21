import { MapSchema, Schema, type } from '@colyseus/schema';

import { ShipState } from './';
import { getConstant } from '../utils';

export class Thruster extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /**
     * the measure of current engione activity
     */
    @type('float32')
    active = 0;

    getGlobalAngle(parent: ShipState): number {
        return this.angle + parent.angle;
    }

    /*
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    get angle(): number {
        return getConstant(this.constants, 'angle');
    }
    get capacity(): number {
        return getConstant(this.constants, 'capacity');
    }

    get energyCost(): number {
        return getConstant(this.constants, 'energyCost');
    }

    get speedFactor(): number {
        return getConstant(this.constants, 'speedFactor');
    }
}
