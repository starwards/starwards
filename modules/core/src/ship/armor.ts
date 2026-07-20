import { ArmorModelName, ArmorModelStats, RTuple2, toPositiveDegreesDelta } from '..';
import { ArraySchema, Schema } from '@colyseus/schema';

import { DesignState } from './system';
import { WeaponDamageType } from '../space/damage-profile';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type ArmorLayerDesign = {
    type: ArmorModelName;
    plateMaxHealth: number;
    withFaradayLayer?: boolean;
};

export type ArmorDesign = {
    numberOfPlates: number;
    // outermost first; the innermost layer must be composite
    layers: ArmorLayerDesign[];
};

// how the armor engages an incoming damage type
export type ArmorResponse =
    // the armor does not engage this type and is transparent to it
    | { kind: 'bypass' }
    // the armor does not engage this type and stops it outright
    | { kind: 'block' }
    // plates take the hit; damage leaks through broken sections and inherent penetration
    | { kind: 'engage'; plateFactor: number; penetration: number };

export class ArmorLayerDesignState extends DesignState implements ArmorModelStats {
    @gameField('float32') plateMaxHealth = 0;
    @gameField('float32') plateDamage_HiExp = 0;
    @gameField('float32') plateDamage_ArmPen = 0;
    @gameField('float32') plateDamage_Frag = 0;
    @gameField('float32') plateDamage_Tandem = 0;
    @gameField('float32') plateDamage_Elec = 0;
    @gameField('float32') penetration_HiExp = 0;
    @gameField('float32') penetration_ArmPen = 0;
    @gameField('float32') penetration_Frag = 0;
    @gameField('float32') penetration_Tandem = 0;
    @gameField('float32') penetration_Elec = 0;
    @tweakable('boolean')
    @gameField('boolean')
    singleUsePlates = false;

    plateDamage(t: WeaponDamageType): number {
        return this[`plateDamage_${t}`];
    }

    penetration(t: WeaponDamageType): number {
        return this[`penetration_${t}`];
    }

    response(t: WeaponDamageType): ArmorResponse {
        const plateFactor = this.plateDamage(t);
        const penetration = this.penetration(t);
        if (plateFactor !== 0) {
            return { kind: 'engage', plateFactor, penetration };
        }
        return penetration >= 1 ? { kind: 'bypass' } : { kind: 'block' };
    }
}

export class ArmorDesignState extends DesignState {
    @gameField('float32') numberOfPlates = 0;
}

export class ArmorLayer extends Schema {
    @gameField(ArmorLayerDesignState)
    design = new ArmorLayerDesignState();

    @range((t: ArmorLayer) => [0, t.design.plateMaxHealth])
    @gameField('float32')
    health = 0;

    get maxHealth(): number {
        return this.design.plateMaxHealth;
    }

    get broken(): boolean {
        return this.health <= 0;
    }
}

export class ArmorPlate extends Schema {
    // outermost first
    @gameField([ArmorLayer])
    layers = new ArraySchema<ArmorLayer>();

    get healthRatio(): number {
        let health = 0;
        let maxHealth = 0;
        for (const layer of this.layers) {
            health += layer.health;
            maxHealth += layer.maxHealth;
        }
        return maxHealth > 0 ? health / maxHealth : 0;
    }

    // a plate is broken only when every one of its layers is down
    get broken(): boolean {
        for (const layer of this.layers) {
            if (layer.health > 0) {
                return false;
            }
        }
        return true;
    }
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
        return this.armorPlates.reduce((r, plate) => r + Number(!plate.broken), 0);
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

    /**
     * yields each plate touched by the hit range together with how many degrees of the hit's
     * own angular width land on that specific plate (sums to the hit's total width across all
     * yielded plates; a plate that contains the entire hit gets all of it).
     */
    public *plateHitOverlaps(localAngleHitRange: RTuple2): IterableIterator<[ArmorPlate, number]> {
        const firstPlateIdx = Math.floor(toPositiveDegreesDelta(localAngleHitRange[0]) / this.degreesPerPlate);
        let offsetIntoPlate = toPositiveDegreesDelta(localAngleHitRange[0]) % this.degreesPerPlate;
        let remaining = toPositiveDegreesDelta(localAngleHitRange[1] - localAngleHitRange[0]);
        const count = this.numberOfPlatesInRange(localAngleHitRange);
        for (let i = 0; i < count; i++) {
            const plateIdx = (i + firstPlateIdx) % this.armorPlates.length;
            const overlap = Math.min(this.degreesPerPlate - offsetIntoPlate, remaining);
            yield [this.armorPlates[plateIdx], overlap];
            remaining -= overlap;
            offsetIntoPlate = 0;
        }
    }
}
