import 'reflect-metadata';

import { DesignState, SystemState, defectible } from './system';
import { getDirectionConfigFromAngle, shipDirectionRange } from './ship-direction';

import { ShipState } from './ship-state';
import { gameField } from '../game-field';
import { range } from '../range';

export type ThrusterDesign = {
    maxAngleError: number;
    capacity: number;
    energyCost: number;
    afterBurnerCapacity: number;
    damage50: number;
};

export class ThrusterDesignState extends DesignState implements ThrusterDesign {
    @gameField('float32') maxAngleError = 0;
    @gameField('float32') capacity = 0;
    @gameField('float32') energyCost = 0;
    @gameField('float32') afterBurnerCapacity = 0;
    @gameField('float32') damage50 = 0;
}
export class Thruster extends SystemState {
    public static isInstance = (o: unknown): o is Thruster => {
        return (o as Thruster)?.type === 'Thruster';
    };

    public readonly type = 'Thruster';

    get name() {
        return `Thruster ${this.index} (${getDirectionConfigFromAngle(this.angle)})`;
    }

    @gameField(ThrusterDesignState)
    design = new ThrusterDesignState();

    /**
     * the index of thruster in the parent ship
     */
    @gameField('int8')
    index = 0;
    /**
     * the measure of current engine activity
     */
    @gameField('float32')
    @range([0, 1])
    active = 0;
    /**
     * the measure of current afterburner activity
     */
    @gameField('float32')
    @range([0, 1])
    afterBurnerActive = 0;

    /*
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    @gameField('float32')
    @range(shipDirectionRange)
    angle = 0.0;

    @gameField('float32')
    @range((t: Thruster) => [-t.design.maxAngleError, t.design.maxAngleError])
    @defectible({ normal: 0, name: 'offset' })
    angleError = 0.0;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'capacity' })
    availableCapacity = 1.0;

    get broken(): boolean {
        return this.availableCapacity === 0 || Math.abs(this.angleError) >= this.design.maxAngleError;
    }
    getGlobalAngle(parent: ShipState): number {
        return this.angle + parent.angle;
    }
    getVelocityCapacity(parent: ShipState): number {
        return this.effectiveness * (this.design.capacity + parent.afterBurner * this.design.afterBurnerCapacity);
    }
}
