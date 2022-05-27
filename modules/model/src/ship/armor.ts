import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';
import { toPositiveDegreesDelta } from '..';

export class ArmorPlate extends Schema {
    @type('uint8')
    health!: number;
}

export class Armor extends Schema {
    @type([ArmorPlate])
    armorPlates!: ArraySchema<ArmorPlate>;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    get numberOfPlates(): number {
        return this.armorPlates.length;
    }

    get plateMaxHealth(): number {
        return getConstant(this.constants, 'plateMaxHealth');
    }

    get healRate(): number {
        return getConstant(this.constants, 'healRate');
    }

    get degreesPerPlate(): number {
        return 360 / this.numberOfPlates;
    }

    public numberOfPlatesInRange(localAngleHitRange: [number, number]): number {
        return Math.ceil(toPositiveDegreesDelta(localAngleHitRange[1] - localAngleHitRange[0]) / this.degreesPerPlate);
    }

    public *platesInRange(localAngleHitRange: [number, number]): IterableIterator<[number, ArmorPlate]> {
        const firstPlateIdx = Math.floor(toPositiveDegreesDelta(localAngleHitRange[0]) / this.degreesPerPlate);
        const lastPlateIndex = firstPlateIdx + this.numberOfPlatesInRange(localAngleHitRange);
        for (let i = firstPlateIdx; i <= lastPlateIndex; i++) {
            yield [i, this.armorPlates.at(i % this.armorPlates.length)];
        }
    }
}
