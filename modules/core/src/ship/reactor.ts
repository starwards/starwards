import { Schema, type } from '@colyseus/schema';

import { ModelParams } from '../model-params';
import { range } from '../range';

export type ReactorDesign = {
    energyPerSecond: number;
    maxEnergy: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

export class Reactor extends Schema {
    public static isInstance = (o: unknown): o is Reactor => {
        return (o as Reactor)?.type === 'Reactor';
    };

    public readonly type = 'Reactor';

    @type(ModelParams)
    modelParams!: ModelParams<keyof ReactorDesign>;

    @type('number')
    @range((t: Reactor) => [0, t.maxEnergy])
    energy = 1000;

    @type('number')
    @range((t: Reactor) => [0, t.maxAfterBurnerFuel])
    afterBurnerFuel = 0;

    @type('float32')
    effeciencyFactor = 1;

    get maxEnergy(): number {
        return this.modelParams.get('maxEnergy');
    }
    get maxAfterBurnerFuel(): number {
        return this.modelParams.get('maxAfterBurnerFuel');
    }
    get afterBurnerCharge(): number {
        return this.modelParams.get('afterBurnerCharge');
    }
    get afterBurnerEnergyCost(): number {
        return this.modelParams.get('afterBurnerEnergyCost');
    }
    get energyPerSecond(): number {
        return this.effeciencyFactor * this.modelParams.get('energyPerSecond');
    }
    /**
     * damage ammount / DPS at which there's 50% chance of system damage
     **/
    get damage50(): number {
        return this.modelParams.get('damage50');
    }

    get broken() {
        return this.energy > 200;
    }
}
