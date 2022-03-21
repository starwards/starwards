import { ShipSystem, SystemCondition } from './ship-system';

import { ShipDirection } from './ship-direction';
import { ShipState } from '.';
import { getConstant } from '../utils';
import { type } from '@colyseus/schema';

export enum ThrusterMalfunctions {
    ATTITUDE_MALFUNCTION,
    CAPACITY_MALFUNCTION,
}
export class Thruster extends ShipSystem {
    public readonly type = 'Thruster';
    /**
     * the measure of current engine activity
     */
    @type('float32')
    active = 0;
    /**
     * the measure of current afterburner activity
     */
    @type('float32')
    afterBurnerActive = 0;

    @type('int8')
    malfunctionType!: ThrusterMalfunctions;

    @type('float32')
    angleError = 0.0;

    @type('float32')
    availableCapacityPercentage = 0.0;

    getGlobalAngle(parent: ShipState): number {
        return this.angle + parent.angle;
    }
    getVelocityCapacity(parent: ShipState): number {
        return (
            this.capacity * this.speedFactor +
            parent.afterBurner * this.afterBurnerCapacity * this.afterBurnerEffectFactor
        );
    }

    /*
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    get angle(): ShipDirection {
        return getConstant(this.constants, 'angle');
    }
    get capacity(): number {
        return this.condition === SystemCondition.BROKEN ? 0 : getConstant(this.constants, 'capacity');
    }

    get energyCost(): number {
        return getConstant(this.constants, 'energyCost');
    }

    get speedFactor(): number {
        return getConstant(this.constants, 'speedFactor');
    }
    get afterBurnerCapacity(): number {
        return this.condition === SystemCondition.BROKEN ? 0 : getConstant(this.constants, 'afterBurnerCapacity');
    }
    get afterBurnerEffectFactor(): number {
        return getConstant(this.constants, 'afterBurnerEffectFactor');
    }

    public static isInstance(o: unknown): o is Thruster {
        return !!o && (o as ShipSystem).type === 'Thruster';
    }
}
