import { ArmorType, armorTypes } from '../logic/damage-matrix';
import { ArraySchema, Schema } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { DesignState } from './system';
import { MAX_SAFE_FLOAT } from '../logic';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type ArmorDesign = {
    modelName?: string;
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
    armorType?: ArmorType;
    /**
     * If true, the ship has a Faraday cage layered over the primary armor.
     * The issue calls Faraday out as the only armor that layers with another
     * type — under this PR's data model that's a single boolean on the
     * single Armor instance instead of a separate slot.
     */
    hasFaradayLayer?: boolean;
};

export class ArmorDesignState extends DesignState implements ArmorDesign {
    @gameField('float32') numberOfPlates = 0;
    @gameField('float32') healRate = 0;
    @gameField('float32') plateMaxHealth = 0;
    @tweakable({ type: 'string enum', enum: armorTypes })
    @gameField('string')
    armorType: ArmorType = 'Composite';
    @tweakable('boolean')
    @gameField('boolean')
    hasFaradayLayer = false;
}

export class ArmorPlate extends Schema {
    @range((t: ArmorPlate) => [0, t.maxHealth])
    @gameField('float32')
    health!: number;

    @range([0, MAX_SAFE_FLOAT])
    @gameField('float32')
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

    /**
     * Convenience accessor — `armor.type` reads through to the design.
     * Reactive armor treats each plate as a one-shot ERA cell; once the cell
     * detonates (plate health hits 0) it does not regenerate, so the damage
     * manager skips heal-on-tick for Reactive armor.
     */
    get type(): ArmorType {
        return this.design.armorType;
    }

    get hasFaradayLayer(): boolean {
        return this.design.hasFaradayLayer;
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
            yield [plateIdx, this.armorPlates[plateIdx]];
        }
    }
}
