import { DesignState, SystemState } from './system';

import { defectible } from './system';
import { gameField } from '../game-field';
import { range } from '../range';

export type RadarDesign = {
    damage50: number;
    range: number;
    /**
     * in energy per 1000m per second
     */
    energyCost: number;
    /**
     * percent of the time in which the range is easing from/to range
     */
    rangeEaseFactor: number;
    malfunctionRange: number;
};

export class RadarDesignState extends DesignState implements RadarDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') range = 0;
    @gameField('float32') energyCost = 0;
    @gameField('float32') rangeEaseFactor = 0;
    @gameField('float32') malfunctionRange = 0;
}
export class Radar extends SystemState {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';
    public readonly name = 'Radar';

    @gameField(RadarDesignState)
    design = new RadarDesignState();

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @gameField('float32')
    @defectible({ normal: 0, name: 'range fluctuation' })
    @range((t: Radar) => [0, 1 - t.design.rangeEaseFactor * 2])
    malfunctionRangeFactor = 0;

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }
}
