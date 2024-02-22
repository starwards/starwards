import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type ManeuveringDesign = {
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

export class ManeuveringDesignState extends DesignState implements ManeuveringDesign {
    @gameField('float32') rotationCapacity = 0;
    @gameField('float32') rotationEnergyCost = 0;
    @gameField('float32') maxAfterBurnerFuel = 0;
    @gameField('float32') afterBurnerCharge = 0;
    @gameField('float32') afterBurnerEnergyCost = 0;
    @gameField('float32') damage50 = 0;
}
export class Maneuvering extends SystemState {
    public static isInstance = (o: unknown): o is Maneuvering => {
        return (o as Maneuvering)?.type === 'Maneuvering';
    };

    public readonly type = 'Maneuvering';
    public readonly name = 'Maneuvering';

    @gameField(ManeuveringDesignState)
    design = new ManeuveringDesignState();

    @gameField('number')
    @range((t: Maneuvering) => [0, t.design.maxAfterBurnerFuel])
    @tweakable('number')
    afterBurnerFuel = 0;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'efficiency' })
    efficiency = 1;

    get broken() {
        return this.efficiency <= 0.2;
    }
}
