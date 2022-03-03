import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export class ArmorPlate extends Schema {
    @type('uint8')
    health = 200;
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
        return getConstant(this.constants, 'degreesPerPlate');
    }
}
