import { ArraySchema, Schema, type } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { DesignState } from './system';
import { MAX_SAFE_FLOAT } from '../logic';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type ArmorDesign = {
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
};

export class ArmorDesignState extends DesignState implements ArmorDesign {
    @number2Digits numberOfPlates = 0;
    @number2Digits healRate = 0;
    @number2Digits plateMaxHealth = 0;
}

export class ArmorPlate extends Schema {
    @number2Digits
    @range((t: ArmorPlate) => [0, t.maxHealth])
    health!: number;

    @number2Digits
    @range([0, MAX_SAFE_FLOAT])
    maxHealth!: number;
}

export class Armor extends Schema {
    @type([ArmorPlate])
    armorPlates!: ArraySchema<ArmorPlate>;

    @type(ArmorDesignState)
    design = new ArmorDesignState();

    get numberOfPlates(): number {
        return this.armorPlates.length;
    }

    get numberOfHealthyPlates(): number {
        return this.armorPlates.reduce((r, plate) => r + Number(plate.health > 0), 0);
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
