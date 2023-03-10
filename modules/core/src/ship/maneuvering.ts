import { DesignState, SystemState, defectible } from './system';

import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';

export type ManeuveringDesign = {
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

export class ManeuveringDesignState extends DesignState implements ManeuveringDesign {
    @number2Digits rotationCapacity = 0;
    @number2Digits rotationEnergyCost = 0;
    @number2Digits maxAfterBurnerFuel = 0;
    @number2Digits afterBurnerCharge = 0;
    @number2Digits afterBurnerEnergyCost = 0;
    @number2Digits damage50 = 0;
}
export class Maneuvering extends SystemState {
    public static isInstance = (o: unknown): o is Maneuvering => {
        return (o as Maneuvering)?.type === 'Maneuvering';
    };

    public readonly type = 'Maneuvering';
    public readonly name = 'Maneuvering';

    @type(ManeuveringDesignState)
    design = new ManeuveringDesignState();

    @type('number')
    @range((t: Maneuvering) => [0, t.design.maxAfterBurnerFuel])
    @tweakable('number')
    afterBurnerFuel = 0;

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'efficiency' })
    efficiency = 1;

    get broken() {
        return this.efficiency <= 0.2;
    }
}
