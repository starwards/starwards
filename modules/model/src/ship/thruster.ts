import { MapSchema, Schema, type } from '@colyseus/schema';
import { ShipArea, ShipState } from '.';

import { ShipDirection } from './ship-direction';
import { getConstant } from '../utils';

export class Thruster extends Schema {
    public static isInstance(o: unknown): o is Thruster {
        return (o as Thruster)?.type === 'Thruster';
    }

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

    @type('float32')
    angleError = 0.0;

    @type('float32')
    availableCapacity = 1.0;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type('int8')
    damageArea!: ShipArea;

    @type('boolean')
    broken = false;

    // dps at which there's 50% chance of system damage
    get dps50(): number {
        return getConstant(this.constants, 'dps50');
    }

    get completeDestructionProbability(): number {
        return getConstant(this.constants, 'completeDestructionProbability');
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

    /*
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    get angle(): ShipDirection {
        return getConstant(this.constants, 'angle');
    }
    get capacity(): number {
        return this.broken ? 0 : getConstant(this.constants, 'capacity');
    }

    get energyCost(): number {
        return getConstant(this.constants, 'energyCost');
    }

    get speedFactor(): number {
        return getConstant(this.constants, 'speedFactor');
    }
    get afterBurnerCapacity(): number {
        return this.broken ? 0 : getConstant(this.constants, 'afterBurnerCapacity');
    }
    get afterBurnerEffectFactor(): number {
        return getConstant(this.constants, 'afterBurnerEffectFactor');
    }
}
