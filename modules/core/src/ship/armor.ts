import { ArraySchema, Schema } from '@colyseus/schema';
import { RTuple2, toPositiveDegreesDelta } from '..';

import { DamageType } from '../space/damage-profile';
import { DesignState } from './system';
import { MAX_SAFE_FLOAT } from '../logic';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

// multiplier on plate erosion per damage type. 0 = the armor does not engage the hit.
// System damage is never scaled by this — once plates break (or penetration applies), the round's own damage goes through.
export type PlateDamageStats = { [T in DamageType as `plateDamage_${T}`]: number };
// fraction (0..1) of system damage that bypasses the plates regardless of plate state.
// When the armor does not engage a type (plateDamage 0), only 0 (blocked) or 1 (full bypass)
// are meaningful — fractional penetration applies to engaging hits only (validated in armor-models.spec).
export type PenetrationStats = { [T in DamageType as `penetration_${T}`]: number };

export type ArmorDesign = {
    modelName?: string;
    numberOfPlates: number;
    healRate: number;
    plateMaxHealth: number;
    // reactive cells: an engaging hit zeroes the plate and it does not heal.
    singleUsePlates?: boolean;
    // pushes the round/missile away before the blast develops: surface-effect scrape does not apply.
    deflectsSurfaceEffect?: boolean;
} & PlateDamageStats &
    PenetrationStats;

// how the armor engages an incoming damage type
export type ArmorResponse =
    // the armor does not engage this type and is transparent to it
    | { kind: 'bypass' }
    // the armor does not engage this type and stops it outright
    | { kind: 'block' }
    // plates take the hit; damage leaks through broken sections and inherent penetration
    | { kind: 'engage'; plateFactor: number; penetration: number };

export class ArmorDesignState extends DesignState implements ArmorDesign {
    @gameField('float32') numberOfPlates = 0;
    @gameField('float32') healRate = 0;
    @gameField('float32') plateMaxHealth = 0;
    @gameField('float32') plateDamage_HiExp = 1;
    @gameField('float32') plateDamage_ArmPen = 1;
    @gameField('float32') plateDamage_Frag = 1;
    @gameField('float32') plateDamage_Tandem = 1;
    @gameField('float32') plateDamage_Elec = 0;
    @gameField('float32') penetration_HiExp = 0;
    @gameField('float32') penetration_ArmPen = 0;
    @gameField('float32') penetration_Frag = 0;
    @gameField('float32') penetration_Tandem = 0;
    @gameField('float32') penetration_Elec = 1;
    @tweakable('boolean')
    @gameField('boolean')
    singleUsePlates = false;

    @tweakable('boolean')
    @gameField('boolean')
    deflectsSurfaceEffect = false;

    plateDamage(t: DamageType): number {
        return this[`plateDamage_${t}`];
    }

    penetration(t: DamageType): number {
        return this[`penetration_${t}`];
    }

    response(t: DamageType): ArmorResponse {
        const plateFactor = this.plateDamage(t);
        const penetration = this.penetration(t);
        if (plateFactor !== 0) {
            return { kind: 'engage', plateFactor, penetration };
        }
        return penetration >= 1 ? { kind: 'bypass' } : { kind: 'block' };
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
