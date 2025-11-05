import { ArraySchema, Schema } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { DesignState } from './system';
import { MAX_SAFE_FLOAT } from '../logic';
import { gameField } from '../game-field';
import { range } from '../range';

export type ArmorDesign = {
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
};

export class ArmorDesignState extends DesignState implements ArmorDesign {
    @gameField('float32') numberOfPlates = 0;
    @gameField('float32') healRate = 0;
    @gameField('float32') plateMaxHealth = 0;
}

export class ArmorPlate extends Schema {
    @gameField('float32')
    @range((t: ArmorPlate) => [0, t.maxHealth])
    health!: number;

    @gameField('float32')
    @range([0, MAX_SAFE_FLOAT])
    maxHealth!: number;
}

export class Armor extends Schema {
    @gameField([ArmorPlate])
    armorPlates!: ArraySchema<ArmorPlate>;

    @gameField(ArmorDesignState)
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
        const firstPlateHitOffset = toPositiveDegreesDelta(localAngleHitRange[0]) % this.degreesPerPlate;
        const hitRangeSize = toPositiveDegreesDelta(localAngleHitRange[1] - localAngleHitRange[0]);
        return Math.ceil((firstPlateHitOffset + hitRangeSize) / this.degreesPerPlate);
    }

    public *platesInRange(localAngleHitRange: RTuple2): IterableIterator<[number, ArmorPlate]> {
        const firstPlateIdx = Math.floor(toPositiveDegreesDelta(localAngleHitRange[0]) / this.degreesPerPlate);
        const count = this.numberOfPlatesInRange(localAngleHitRange);
        for (let i = 0; i < count; i++) {
            const plateIdx = (i + firstPlateIdx) % this.armorPlates.length;
            yield [plateIdx, this.armorPlates[plateIdx]!];
        }
    }
}
