import { ShipArea, XY, notNull, toDegreesDelta } from '..';
import { Faction, Vec2 } from '../space';
import { ShipModel } from '../configurations';
import { range, rangeSchema } from '../range';

import { Armor } from './armor';
import { ArraySchema, Schema } from '@colyseus/schema';
import { ChainGun } from './chain-gun';
import { DesignState } from './system';
import { Docking } from './docking';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { ShipDirection } from './ship-direction';
import { SmartPilot } from './smart-pilot';
import { Targeting } from './targeting';
import { Thruster } from './thruster';
import { Tube } from './tube';
import { Warp } from './warp';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}

export enum IdleStrategy {
    PLAY_DEAD,
    ROAM,
    STAND_GROUND,
}

export enum Order {
    NONE,
    MOVE,
    ATTACK,
    FOLLOW,
}

export type ShipPropertiesDesign = {
    totalCoolant: number;
    systemKillRatio: number; // ratio of broken systems to cause ship death. <=0 means death on first hit, >1 means can't be killed
};

export class ShipPropertiesDesignState extends DesignState implements ShipPropertiesDesign {
    @gameField('float32') totalCoolant = 0;
    @gameField('float32') systemKillRatio = 0;
}
@rangeSchema({ '/turnSpeed': [-90, 90], '/angle': [0, 360] })
export class ShipState extends Schema {
    // Fields synced from SpaceObjectBase
    @gameField('string')
    public id = '';

    @gameField(Vec2)
    public position: Vec2 = new Vec2(0, 0);

    @gameField(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    @tweakable('number')
    @range([0, 360])
    @gameField('float32')
    public angle = 0;

    @tweakable({ type: 'number' })
    @gameField('float32')
    public turnSpeed = 0;

    @tweakable({ type: 'number', number: { min: 0.05 } })
    @gameField('float32')
    public radius = 0.05;

    @gameField('boolean')
    public destroyed = false;

    @tweakable('boolean')
    @gameField('boolean')
    public freeze = false;

    @tweakable('boolean')
    @gameField('boolean')
    public expendable = true;

    @gameField(['uint8'])
    public scanLevels = new ArraySchema<number>();

    // Fields from Spaceship
    @gameField('string')
    public readonly type = 'Spaceship';

    @gameField('int8')
    @tweakable({ type: 'enum', enum: Faction })
    public faction: Faction = Faction.NONE;

    @gameField('float32')
    public radarRange = 0;

    @gameField('string')
    @tweakable('string')
    public model: ShipModel | null = null;

    // ShipState-specific fields
    @gameField(ShipPropertiesDesignState)
    design = new ShipPropertiesDesignState();

    @gameField('boolean')
    isPlayerShip = true;

    @gameField('int8')
    @tweakable({ type: 'enum', enum: IdleStrategy })
    idleStrategy = IdleStrategy.PLAY_DEAD;

    @gameField('int8')
    @tweakable({ type: 'enum', enum: Order })
    order = Order.NONE;

    @gameField('string')
    @tweakable('string')
    orderTargetId: string | null = null;

    @gameField(Vec2)
    orderPosition = new Vec2();

    @gameField('string')
    currentTask = '';

    @gameField([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @gameField([Tube])
    tubes = new ArraySchema<Tube>();

    @gameField(ChainGun)
    chainGun: ChainGun | null = null;

    @gameField(Radar)
    radar!: Radar;

    @gameField(Reactor)
    reactor!: Reactor;

    @gameField(SmartPilot)
    smartPilot!: SmartPilot;

    @gameField(Armor)
    armor!: Armor;

    @gameField(Magazine)
    magazine!: Magazine;

    @gameField(Targeting)
    weaponsTarget!: Targeting;

    @gameField(Warp)
    warp!: Warp;

    @gameField(Docking)
    docking!: Docking;

    @gameField(Maneuvering)
    maneuvering!: Maneuvering;

    @gameField('float32')
    @range([-1, 1])
    rotation = 0;

    @gameField('float32')
    @range([-1, 1])
    boost = 0;

    @gameField('float32')
    @range([-1, 1])
    strafe = 0;

    @gameField('float32')
    @range([0, 1])
    antiDrift = 0;

    @gameField('float32')
    @range([0, 1])
    breaks = 0;

    @gameField('float32')
    @range([0, 1])
    afterBurner = 0;

    @gameField('int8')
    targeted = TargetedStatus.NONE;

    @gameField('boolean')
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
                    notNull,
                );
            case ShipArea.rear:
                return [this.reactor, this.maneuvering, ...this.thrusters.values(), ...this.tubes.values()].filter(
                    notNull,
                );
        }
        return [];
    }

    // Methods from SpaceObjectBase
    globalToLocal(global: XY) {
        return XY.rotate(global, -this.angle);
    }

    localToGlobal(local: XY) {
        return XY.rotate(local, this.angle);
    }

    get directionAxis() {
        return XY.rotate(XY.one, this.angle - 90);
    }
}
