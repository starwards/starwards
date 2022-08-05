import { ArraySchema, Schema, type } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { ArmorModel } from './ship-configuration';
import { ModelParams } from '../model-params';
import { range } from '../range';

export class ArmorPlate extends Schema {
    @type('float32')
    @range((t: ArmorPlate) => [0, t.maxHealth])
    health!: number;

    @type('float32')
    @range([0, Number.MAX_VALUE])
    maxHealth!: number;
}

export class Armor extends Schema {
    @type([ArmorPlate])
    armorPlates!: ArraySchema<ArmorPlate>;

    @type(ModelParams)
    modelParams!: ModelParams<keyof ArmorModel>;

    get numberOfPlates(): number {
        return this.armorPlates.length;
    }

    get plateMaxHealth(): number {
        return this.modelParams.get('plateMaxHealth');
    }

    get healRate(): number {
        return this.modelParams.get('healRate');
    }

    get degreesPerPlate(): number {
        return 360 / this.numberOfPlates;
    }

    public numberOfPlatesInRange(localAngleHitRange: RTuple2): number {
        return Math.ceil(toPositiveDegreesDelta(localAngleHitRange[1] - localAngleHitRange[0]) / this.degreesPerPlate);
    }

    public *platesInRange(localAngleHitRange: RTuple2): IterableIterator<[number, ArmorPlate]> {
        const firstPlateIdx = Math.floor(toPositiveDegreesDelta(localAngleHitRange[0]) / this.degreesPerPlate);
        const count = this.numberOfPlatesInRange(localAngleHitRange);
        for (let i = 0; i < count; i++) {
            const plateIdx = (i + firstPlateIdx) % this.armorPlates.length;
            yield [plateIdx, this.armorPlates.at(plateIdx)];
        }
    }
}
