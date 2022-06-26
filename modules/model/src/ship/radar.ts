import { Schema, type } from '@colyseus/schema';

import { ModelParams } from '../model-params';
import { RadarModel } from './ship-configuration';

export class Radar extends Schema {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';

    @type(ModelParams)
    modelParams!: ModelParams<keyof RadarModel>;

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @type('float32')
    malfunctionRangeFactor = 0;

    get basicRange(): number {
        return this.modelParams.get('basicRange');
    }

    get malfunctionRange(): number {
        return this.modelParams.get('malfunctionRange');
    }

    /**
     * percent of the time in which the range is easing from/to basicRange
     */
    get rangeEaseFactor(): number {
        return this.modelParams.get('rangeEaseFactor');
    }
    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return this.modelParams.get('damage50');
    }

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.rangeEaseFactor * 2;
    }
}
