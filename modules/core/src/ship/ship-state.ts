import { ArraySchema, type } from '@colyseus/schema';
import { XY, toDegreesDelta } from '..';
import { range, rangeSchema } from '../range';

import { Armor } from './armor';
import { ChainGun } from './chain-gun';
import { DesignState } from './system';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { ShipDirection } from './ship-direction';
import { SmartPilot } from './smart-pilot';
import { Spaceship } from '../space';
import { Thruster } from './thruster';
import { number2Digits } from '../number-field';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}

export type ShipPropertiesDesign = {
    rotationCapacity: number;
    rotationEnergyCost: number;
    maxChainGunAmmo: number;
};

export class ShipPropertiesDesignState extends DesignState implements ShipPropertiesDesign {
    @number2Digits rotationCapacity = 0;
    @number2Digits rotationEnergyCost = 0;
    @number2Digits maxChainGunAmmo = 0;
}
@rangeSchema({ '/turnSpeed': [-90, 90], '/angle': [0, 360] })
export class ShipState extends Spaceship {
    @type(ShipPropertiesDesignState)
    design = new ShipPropertiesDesignState();

    @type([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @type(ChainGun)
    chainGun: ChainGun | null = null;

    @type(Radar)
    radar!: Radar;

    @type(Reactor)
    reactor!: Reactor;

    @type(SmartPilot)
    smartPilot!: SmartPilot;

    @number2Digits
    @range([-1, 1])
    rotation = 0;

    @number2Digits
    @range([-1, 1])
    boost = 0;

    @number2Digits
    @range([-1, 1])
    strafe = 0;

    @number2Digits
    @range([0, 1])
    antiDrift = 0;

    @number2Digits
    @range([0, 1])
    breaks = 0;

    @number2Digits
    @range([0, 1])
    afterBurner = 0;

    @type('int8')
    targeted = TargetedStatus.NONE;

    @type(Armor)
    armor!: Armor;

    @type('int32')
    chainGunAmmo = 0;

    // server only, used for commands
    @range([0, 1])
    public afterBurnerCommand = 0;
    public nextTargetCommand = false;
    public clearTargetCommand = false;
    public rotationModeCommand = false;
    public maneuveringModeCommand = false;

    @range([0, 360])
    get velocityAngle() {
        return XY.angleOf(this.velocity);
    }
    @range((t: ShipState) => [0, t.maxMaxSpeed])
    get speed() {
        return XY.lengthOf(this.velocity);
    }
    *angleThrusters(direction: ShipDirection) {
        for (const thruster of this.thrusters) {
            if (toDegreesDelta(direction) === toDegreesDelta(thruster.angle)) {
                yield thruster;
            }
        }
    }

    velocityCapacity(direction: ShipDirection) {
        return [...this.angleThrusters(direction)].reduce((s, t) => s + t.getVelocityCapacity(this), 0);
    }

    getMaxSpeedForAfterburner(afterBurner: number) {
        return this.smartPilot.maxSpeed + afterBurner * this.smartPilot.maxSpeedFromAfterBurner;
    }

    get maxSpeed() {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    get maxMaxSpeed() {
        return this.getMaxSpeedForAfterburner(1);
    }
}
