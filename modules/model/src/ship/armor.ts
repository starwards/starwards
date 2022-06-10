import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { getConstant } from '../utils';

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
