import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

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
        return getConstant(this.constants, 'numberOfPlates');
    }

    get plateMaxHealth(): number {
        return getConstant(this.constants, 'plateMaxHealth');
    }

    set plateMaxHealth(health: number) {
        this.constants.set('plateMaxHealth', health);
    }

    get healRate(): number {
        return getConstant(this.constants, 'healRate');
    }

    get degreesPerPlate(): number {
        return 360 / getConstant(this.constants, 'numberOfPlates');
    }

    public *platesInRange(localAngleHitRange: [number, number]): IterableIterator<ArmorPlate> {
        const platesArray = this.armorPlates.toArray() || [];
        const platesHitRange = [
            Math.floor(localAngleHitRange[0] / this.degreesPerPlate),
            Math.floor(localAngleHitRange[1] / this.degreesPerPlate),
        ];
        if (platesHitRange[0] < platesArray.length && platesHitRange[1] < platesArray.length) {
            const platesSlice =
                platesHitRange[0] < platesHitRange[1]
                    ? platesArray.slice(platesHitRange[0], platesHitRange[1])
                    : platesArray
                          .slice(platesHitRange[0], platesArray.length - 1)
                          .concat(platesArray.slice(0, platesHitRange[1]));
            yield* platesSlice;
        }
    }
}
