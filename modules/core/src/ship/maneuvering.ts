import { DesignState, SystemState, defectible } from './system';

import { atMostThreshold } from '../logic/formulas';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

/** Efficiency at or below which maneuvering is broken. */
const MANEUVERING_BROKEN_EFFICIENCY = 0.2;

export type ManeuveringDesign = {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxAfterBurnerFuel: number;
    afterBurnerCharge: number;
    afterBurnerEnergyCost: number;
    damage50: number;
};

class ManeuveringDesignState extends DesignState implements ManeuveringDesign {
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

    @range((t: Maneuvering) => [0, t.design.maxAfterBurnerFuel])
    @tweakable('number')
    @gameField('number')
    afterBurnerFuel = 0;

    @range([0, 1])
    @defectible({ normal: 1, name: 'efficiency' })
    @gameField('float32')
    efficiency = 1;

    /** Compared the way clients read the `float32` field (see `atLeastThreshold`). */
    get broken() {
        return atMostThreshold(this.efficiency, MANEUVERING_BROKEN_EFFICIENCY);
    }
}
