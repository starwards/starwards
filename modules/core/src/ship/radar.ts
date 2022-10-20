import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { number2Digits } from '../number-field';

export type RadarDesign = {
    damage50: number;
    basicRange: number;
    /**
     * percent of the time in which the range is easing from/to basicRange
     */
    rangeEaseFactor: number;
    malfunctionRange: number;
};

export class RadarDesignState extends DesignState implements RadarDesign {
    @number2Digits damage50 = 0;
    @number2Digits basicRange = 0;
    @number2Digits rangeEaseFactor = 0;
    @number2Digits malfunctionRange = 0;
}
export class Radar extends Schema {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';

    @type(RadarDesignState)
    design = new RadarDesignState();

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @number2Digits
    malfunctionRangeFactor = 0;

    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return this.design.damage50;
    }

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }
}
