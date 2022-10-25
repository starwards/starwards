import 'reflect-metadata';

import { Schema, type } from '@colyseus/schema';
import { ShipDirection, ShipState } from '.';

import { DesignState } from './system';
import { defectible } from '../defectible';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type ThrusterDesign = {
    maxAngleError: number;
    capacity: number;
    energyCost: number;
    speedFactor: number;
    afterBurnerCapacity: number;
    afterBurnerEffectFactor: number;
    damage50: number;
    completeDestructionProbability: number;
};

export class ThrusterDesignState extends DesignState implements ThrusterDesign {
    @number2Digits maxAngleError = 0;
    @number2Digits capacity = 0;
    @number2Digits energyCost = 0;
    @number2Digits speedFactor = 0;
    @number2Digits afterBurnerCapacity = 0;
    @number2Digits afterBurnerEffectFactor = 0;
    @number2Digits damage50 = 0;
    @number2Digits completeDestructionProbability = 0;
}
export class Thruster extends Schema {
    public static isInstance = (o: unknown): o is Thruster => {
        return (o as Thruster)?.type === 'Thruster';
    };

    public readonly type = 'Thruster';

    get name() {
        return `Thruster ${this.index} (${ShipDirection[this.angle]})`;
    }

    @type(ThrusterDesignState)
    design = new ThrusterDesignState();

    /**
     * the index of thruster in the parent ship
     */
    @type('int8')
    index = 0;
    /**
     * the measure of current engine activity
     */
    @number2Digits
    active = 0;
    /**
     * the measure of current afterburner activity
     */
    @number2Digits
    afterBurnerActive = 0;

    /*
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    @number2Digits
    angle = 0.0;

    @number2Digits
    @range((t: Thruster) => [-t.design.maxAngleError, t.design.maxAngleError])
    @defectible({ normal: 0, name: 'angle deviates' })
    angleError = 0.0;

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'capacity suboptimal' })
    availableCapacity = 1.0;

    get broken(): boolean {
        return this.availableCapacity === 0 || Math.abs(this.angleError) >= this.design.maxAngleError;
    }
    getGlobalAngle(parent: ShipState): number {
        return this.angle + parent.angle;
    }
    getVelocityCapacity(parent: ShipState): number {
        return (
            this.capacity * this.design.speedFactor +
            parent.afterBurner * this.afterBurnerCapacity * this.design.afterBurnerEffectFactor
        );
    }

    get capacity(): number {
        return this.broken ? 0 : this.design.capacity;
    }

    get afterBurnerCapacity(): number {
        return this.broken ? 0 : this.design.afterBurnerCapacity;
    }
}
