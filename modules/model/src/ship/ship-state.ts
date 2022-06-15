import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { Spaceship, Vec2 } from '../space';

import { Armor } from './armor';
import { ChainGun } from './chain-gun';
import { Radar } from './radar';
import { ShipDirection } from './ship-direction';
import { Thruster } from './thruster';
import { getConstant } from '../utils';
import { toDegreesDelta } from '..';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}

export enum SmartPilotMode {
    DIRECT,
    VELOCITY,
    TARGET,
}
export class SmartPilotState extends Schema {
    @type('int8')
    rotationMode!: SmartPilotMode;
    @type('int8')
    maneuveringMode!: SmartPilotMode;
    @type('float32')
    rotation = 0;
    @type('float32')
    rotationTargetOffset = 0;
    @type(Vec2)
    maneuvering: Vec2 = new Vec2(0, 0);
    @type('boolean')
    broken = false;

    readonly maxTargetAimOffset = 30;
    readonly aimOffsetSpeed = 15;
    readonly maxTurnSpeed = 90;
}

export class ShipState extends Spaceship {
    @type({ map: 'float32' })
    constants!: MapSchema<number>;

    @type([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @type(ChainGun)
    chainGun!: ChainGun;

    @type(Radar)
    radar!: Radar;

    @type(SmartPilotState)
    smartPilot!: SmartPilotState;

    @type('float32')
    rotation = 0;
    @type('float32')
    boost = 0;
    @type('float32')
    strafe = 0;

    @type('float32')
    antiDrift = 0;
    @type('float32')
    breaks = 0;
    @type('number')
    energy = 1000;
    @type('number')
    afterBurnerFuel = 0;
    @type('float32')
    afterBurner = 0;

    @type('int8')
    targeted = TargetedStatus.NONE;

    @type(Armor)
    armor!: Armor;

    @type('int32')
    chainGunAmmo = 0;

    // server only, used for commands
    public afterBurnerCommand = 0;
    public nextTargetCommand = false;
    public clearTargetCommand = false;
    public rotationModeCommand = false;
    public maneuveringModeCommand = false;

    // TODO: move to logic (not part of state)
    get maxEnergy(): number {
        return getConstant(this, 'maxEnergy');
    }
    get maxAfterBurner(): number {
        return getConstant(this, 'maxAfterBurner');
    }
    get afterBurnerCharge(): number {
        return getConstant(this, 'afterBurnerCharge');
    }
    get afterBurnerEnergyCost(): number {
        return getConstant(this, 'afterBurnerEnergyCost');
    }
    get energyPerSecond(): number {
        return getConstant(this, 'energyPerSecond');
    }
    get rotationCapacity(): number {
        return getConstant(this, 'rotationCapacity');
    }
    get rotationEnergyCost(): number {
        return getConstant(this, 'rotationEnergyCost');
    }
    get antiDriftEffectFactor(): number {
        return getConstant(this, 'antiDriftEffectFactor');
    }
    get breaksEffectFactor(): number {
        return getConstant(this, 'breaksEffectFactor');
    }
    get rotationEffectFactor(): number {
        return getConstant(this, 'rotationEffectFactor');
    }
    get turnSpeedCapacity(): number {
        return this.rotationCapacity * this.rotationEffectFactor;
    }
    get maxChainGunAmmo(): number {
        return getConstant(this, 'maxChainGunAmmo');
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
        return getConstant(this, 'maxSpeed') + afterBurner * getConstant(this, 'maxSpeeFromAfterBurner');
    }

    get maxSpeed() {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    get maxMaxSpeed() {
        return this.getMaxSpeedForAfterburner(1);
    }
}
