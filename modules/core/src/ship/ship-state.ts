import { ArraySchema, type } from '@colyseus/schema';
import { ShipArea, XY, notNull, toDegreesDelta, tweakable } from '..';
import { range, rangeSchema } from '../range';

import { Armor } from './armor';
import { ChainGun } from './chain-gun';
import { DesignState } from './system';
import { Docking } from './docking';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { ShipDirection } from './ship-direction';
import { SmartPilot } from './smart-pilot';
import { Spaceship } from '../space';
import { Targeting } from './targeting';
import { Thruster } from './thruster';
import { Tube } from './tube';
import { Warp } from './warp';
import { number2Digits } from '../number-field';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}

export type ShipPropertiesDesign = {
    totalCoolant: number;
};

export class ShipPropertiesDesignState extends DesignState implements ShipPropertiesDesign {
    @number2Digits totalCoolant = 0;
}
@rangeSchema({ '/turnSpeed': [-90, 90], '/angle': [0, 360] })
export class ShipState extends Spaceship {
    @type(ShipPropertiesDesignState)
    design = new ShipPropertiesDesignState();

    @type([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @type([Tube])
    tubes = new ArraySchema<Tube>();

    @type(ChainGun)
    chainGun: ChainGun | null = null;

    @type(Radar)
    radar!: Radar;

    @type(Reactor)
    reactor!: Reactor;

    @type(SmartPilot)
    smartPilot!: SmartPilot;

    @type(Armor)
    armor!: Armor;

    @type(Magazine)
    magazine!: Magazine;

    @type(Targeting)
    weaponsTarget!: Targeting;

    @type(Warp)
    warp!: Warp;

    @type(Docking)
    docking!: Docking;

    @type(Maneuvering)
    maneuvering!: Maneuvering;

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

    @type('boolean')
    @tweakable('boolean')
    ecrControl = false;

    // server only, used for commands
    @range([0, 1])
    public afterBurnerCommand = 0;
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
        return this.smartPilot.design.maxSpeed + afterBurner * this.smartPilot.design.maxSpeedFromAfterBurner;
    }

    get maxSpeed() {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    get maxMaxSpeed() {
        return this.getMaxSpeedForAfterburner(1);
    }

    get rotationCapacity() {
        return this.maneuvering.design.rotationCapacity;
    }

    systems() {
        return [...this.systemsByAreas(ShipArea.front), ...this.systemsByAreas(ShipArea.rear)];
    }

    systemsByAreas(area: ShipArea) {
        switch (area) {
            case ShipArea.front:
                return [this.chainGun, this.radar, this.smartPilot, this.magazine, this.warp, this.docking].filter(
                    notNull
                );
            case ShipArea.rear:
                return [this.reactor, this.maneuvering, ...this.thrusters.toArray(), ...this.tubes.toArray()].filter(
                    notNull
                );
        }
        return [];
    }
}
