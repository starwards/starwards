import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { MAX_SYSTEM_HEAT } from './heat-manager';
import { defectible } from './system';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

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
    public readonly name = 'Radar';

    @number2Digits
    public energyPerMinute = 0;

    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @number2Digits
    public heat = 0;

    @type(RadarDesignState)
    design = new RadarDesignState();

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @number2Digits
    @defectible({ normal: 0, name: 'range fluctuation' })
    @range((t: Radar) => [0, 1 - t.design.rangeEaseFactor * 2])
    malfunctionRangeFactor = 0;

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }
}
