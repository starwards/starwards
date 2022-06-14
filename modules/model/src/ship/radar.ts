import { MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export class Radar extends Schema {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';

    @type('float32')
    basicRange = 0;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return getConstant(this.constants, 'damage50');
    }

    get broken() {
        return false;
    }
}
