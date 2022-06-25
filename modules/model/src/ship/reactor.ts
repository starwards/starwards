import { MapSchema, Schema, type } from '@colyseus/schema';

import { getConstant } from '../utils';

export class Reactor extends Schema {
    public static isInstance = (o: unknown): o is Reactor => {
        return (o as Reactor)?.type === 'Reactor';
    };

    public readonly type = 'Reactor';

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type('number')
    energy = 1000;
    @type('number')
    afterBurnerFuel = 0;

    get maxEnergy(): number {
        return getConstant(this, 'maxEnergy');
    }
    get maxAfterBurnerFuel(): number {
        return getConstant(this, 'maxAfterBurnerFuel');
    }
    get afterBurnerCharge(): number {
        return getConstant(this, 'afterBurnerCharge');
    }
    get afterBurnerEnergyCost(): number {
        return getConstant(this, 'afterBurnerEnergyCost');
    }
    get energyPerSecond(): number {
        return getConstant(this, 'energyPerSecond');
    }
    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return getConstant(this, 'damage50');
    }

    get broken() {
        return false;
    }
}
