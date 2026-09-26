import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

/** Efficiency at or below which maneuvering is broken. */
const MANEUVERING_BROKEN_EFFICIENCY = 0.2;
/** Headroom for a value that passed through a `float32` game field (relative error ~6e-8). */
const FLOAT32_TOLERANCE = 1e-6;

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

    /**
     * Tolerant of `float32` rounding: the synced field stores 0.2 as 0.2000000030, so an exact
     * comparison would read a broken system as intact on every client and in every snapshot.
     */
    get broken() {
        return this.efficiency <= MANEUVERING_BROKEN_EFFICIENCY + FLOAT32_TOLERANCE;
    }
}
