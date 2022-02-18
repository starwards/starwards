import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';
import { normalMarsagliaRandom } from '..';

export class ArmorPlate extends Schema {
    @type('uint8')
    health = 200;

    @type('int16')
    startingAngle = 0;

    @type('boolean')
    broken = false;
}

export class Armor extends Schema {
    @type([ArmorPlate])
    armorPlates: ArraySchema<ArmorPlate>;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    constructor(numberOfPlates: number, plateMaxHealth = 200, healRate = 3.33) {
        super();
        let plate: ArmorPlate;
        this.armorPlates = new ArraySchema<ArmorPlate>();
        this.constants = new MapSchema<number>();
        this.constants.set('numberOfPlates', numberOfPlates);
        this.constants.set('healRate', healRate);
        this.constants.set('plateMaxHealth', plateMaxHealth);
        const degreesPerPlate = Math.round((numberOfPlates / 360 + Number.EPSILON) * 1000) / 1000;
        this.constants.set('degreesPerPlate', degreesPerPlate);
        for (let i = 0; i < numberOfPlates; i++) {
            plate = new ArmorPlate();
            plate.health = plateMaxHealth;
            plate.startingAngle = i * degreesPerPlate;
            this.armorPlates.push(plate);
        }
    }

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
        return getConstant(this.constants, 'degreesPerPlate');
    }

    healPlates(deltaSeconds: number) {
        for (const plate of this.armorPlates) {
            if (!plate.broken && plate.health < this.plateMaxHealth) {
                plate.health = Math.min(plate.health + this.healRate * deltaSeconds, this.plateMaxHealth);
            }
        }
    }

    getNumberOfBrokenPlatesInRange(hitRange: [number, number]): number {
        const hitPlatesRange = [
            Math.floor(hitRange[0] / this.degreesPerPlate),
            Math.ceil(hitRange[1] / this.degreesPerPlate),
        ];
        let brokenPlates = 0;
        for (const plate of this.armorPlates.slice(hitPlatesRange[0], hitPlatesRange[1])) {
            if (plate.broken) {
                brokenPlates++;
            }
        }
        return brokenPlates;
    }

    applyDamageToArmor(damageFactor: number, hitRange: [number, number]) {
        const hitPlatesRange = [
            Math.floor(hitRange[0] / this.degreesPerPlate),
            Math.ceil(hitRange[1] / this.degreesPerPlate),
        ];
        for (const plate of this.armorPlates.slice(hitPlatesRange[0], hitPlatesRange[1])) {
            if (!plate.broken) {
                plate.health -= damageFactor * normalMarsagliaRandom(20, 4);
                if (plate.health <= 0) {
                    plate.broken = true;
                }
            }
        }
    }

    fixAllPlates() {
        for (const plate of this.armorPlates) {
            plate.broken = false;
            plate.health = this.plateMaxHealth;
        }
    }
}
