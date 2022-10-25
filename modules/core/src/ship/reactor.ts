import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { defectible } from '../defectible';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type ReactorDesign = {
    energyPerSecond: number;
    maxEnergy: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

export class ReactorDesignState extends DesignState implements ReactorDesign {
    @number2Digits energyPerSecond = 0;
    @number2Digits maxEnergy = 0;
    @number2Digits maxAfterBurnerFuel = 0;
    @number2Digits afterBurnerCharge = 0;
    @number2Digits afterBurnerEnergyCost = 0;
    @number2Digits damage50 = 0;
}

export class Reactor extends Schema {
    public static isInstance = (o: unknown): o is Reactor => {
        return (o as Reactor)?.type === 'Reactor';
    };

    public readonly type = 'Reactor';
    public readonly name = 'Reactor';

    @type(ReactorDesignState)
    design = new ReactorDesignState();

    @type('number')
    @range((t: Reactor) => [0, t.design.maxEnergy])
    energy = 1000;

    @type('number')
    @range((t: Reactor) => [0, t.design.maxAfterBurnerFuel])
    afterBurnerFuel = 0;

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'effeciency' })
    effeciencyFactor = 1;

    get energyPerSecond(): number {
        return this.effeciencyFactor * this.design.energyPerSecond;
    }

    get broken() {
        return this.effeciencyFactor === 0;
    }
}
