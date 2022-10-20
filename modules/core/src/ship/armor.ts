import { ArraySchema, Schema, type } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { ArmorDesign } from './ship-configuration';
import { MAX_SAFE_FLOAT } from '../logic';
import { ModelParams } from '../model-params';
import { range } from '../range';

export class ArmorPlate extends Schema {
    @type('float32')
    @range((t: ArmorPlate) => [0, t.maxHealth])
    health!: number;

    @type('float32')
    @range([0, MAX_SAFE_FLOAT])
    maxHealth!: number;
}

export class Armor extends Schema {
    @type([ArmorPlate])
    armorPlates!: ArraySchema<ArmorPlate>;

    @type(ModelParams)
    modelParams!: ModelParams<keyof ArmorDesign>;

    get numberOfPlates(): number {
        return this.armorPlates.length;
    }

    get numberOfHealthyPlates(): number {
        return this.armorPlates.reduce((r, plate) => r + Number(plate.health > 0), 0);
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
