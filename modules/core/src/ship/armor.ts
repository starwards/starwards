import { ArraySchema, Schema } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { DamageType } from '../space/damage-profile';
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
    // multiplier applied to plate and system damage per damage type. 0 = the armor does not engage the hit.
    plateDamage_HiExp: number;
    plateDamage_ArmPen: number;
    plateDamage_Frag: number;
    plateDamage_Cluster: number;
    plateDamage_Tandem: number;
    plateDamage_Elec: number;
    // fraction (0..1) of system damage that bypasses the plates regardless of plate state.
    penetration_HiExp: number;
    penetration_ArmPen: number;
    penetration_Frag: number;
    penetration_Cluster: number;
    penetration_Tandem: number;
    penetration_Elec: number;
    // ERA cells: an engaging hit zeroes the plate and it does not heal.
    singleUsePlates?: boolean;
};

export class ArmorDesignState extends DesignState implements ArmorDesign {
    @gameField('float32') numberOfPlates = 0;
    @gameField('float32') healRate = 0;
    @gameField('float32') plateMaxHealth = 0;
    @gameField('float32') plateDamage_HiExp = 1;
    @gameField('float32') plateDamage_ArmPen = 1;
    @gameField('float32') plateDamage_Frag = 1;
    @gameField('float32') plateDamage_Cluster = 1;
    @gameField('float32') plateDamage_Tandem = 1;
    @gameField('float32') plateDamage_Elec = 0;
    @gameField('float32') penetration_HiExp = 0;
    @gameField('float32') penetration_ArmPen = 0;
    @gameField('float32') penetration_Frag = 0;
    @gameField('float32') penetration_Cluster = 0;
    @gameField('float32') penetration_Tandem = 0;
    @gameField('float32') penetration_Elec = 1;
    @tweakable('boolean')
    @gameField('boolean')
    singleUsePlates = false;

    plateDamage(t: DamageType): number {
        return this[`plateDamage_${t}`];
    }

    penetration(t: DamageType): number {
        return this[`penetration_${t}`];
    }
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
