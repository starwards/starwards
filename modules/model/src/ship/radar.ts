import { MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export class Radar extends Schema {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @type('float32')
    malfunctionRangeFactor = 0;

    get basicRange(): number {
        return getConstant(this.constants, 'basicRange');
    }

    get malfunctionRange(): number {
        return getConstant(this.constants, 'malfunctionRange');
    }

    /**
     * percent of the time in which the range is easing from/to basicRange
     */
    get rangeEaseFactor(): number {
        return getConstant(this.constants, 'rangeEaseFactor');
    }
    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return getConstant(this.constants, 'damage50');
    }

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.rangeEaseFactor * 2;
    }
}
