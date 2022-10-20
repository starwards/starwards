import 'reflect-metadata';

import { Schema, type } from '@colyseus/schema';

import { ModelParams } from '../model-params';
import { ShipState } from '.';
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

export class Thruster extends Schema {
    public static isInstance = (o: unknown): o is Thruster => {
        return (o as Thruster)?.type === 'Thruster';
    };

    public readonly type = 'Thruster';
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
    @range((t: Thruster) => [-t.maxAngleError, t.maxAngleError])
    angleError = 0.0;

    @number2Digits
    @range([0, 1])
    availableCapacity = 1.0;

    @type(ModelParams)
    modelParams!: ModelParams<keyof ThrusterDesign>;

    get broken(): boolean {
        return this.availableCapacity === 0 || Math.abs(this.angleError) >= this.maxAngleError;
    }
    // dps at which there's 50% chance of system damage
    get damage50(): number {
        return this.modelParams.get('damage50');
    }
    getGlobalAngle(parent: ShipState): number {
        return this.angle + parent.angle;
    }
    getVelocityCapacity(parent: ShipState): number {
        return (
            this.capacity * this.speedFactor +
            parent.afterBurner * this.afterBurnerCapacity * this.afterBurnerEffectFactor
        );
    }

    get maxAngleError(): number {
        return this.modelParams.get('maxAngleError');
    }
    get capacity(): number {
        return this.broken ? 0 : this.modelParams.get('capacity');
    }

    get energyCost(): number {
        return this.modelParams.get('energyCost');
    }

    get speedFactor(): number {
        return this.modelParams.get('speedFactor');
    }
    get afterBurnerCapacity(): number {
        return this.broken ? 0 : this.modelParams.get('afterBurnerCapacity');
    }
    get afterBurnerEffectFactor(): number {
        return this.modelParams.get('afterBurnerEffectFactor');
    }
}
