import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { ShipAreas, ShipSystem } from './ship-system';
import { Spaceship, Vec2 } from '../space';

import { Armor } from './armor';
import { ChainGun } from './chain-gun';
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

export class ShipHealth extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type('uint16')
    frontHealth = 1000;
    @type('uint16')
    rearHealth = 1000;

    get maxFrontHealth(): number {
        return getConstant(this.constants, 'maxFrontHealth');
    }

    get maxRearHealth(): number {
        return getConstant(this.constants, 'maxRearHealth');
    }
}
export class ShipState extends Spaceship {
    @type({ map: 'float32' })
    constants!: MapSchema<number>;

    @type([Thruster])
    thrusters!: ArraySchema<Thruster>;

    @type(ChainGun)
    chainGun!: ChainGun;

    @type(SmartPilotState)
    smartPilot!: SmartPilotState;

    @type(ShipHealth)
    health!: ShipHealth;

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

    // server only, used for commands
    public afterBurnerCommand = 0;
    public nextTargetCommand = false;
    public clearTargetCommand = false;
    public rotationModeCommand = false;
    public maneuveringModeCommand = false;

    // TODO: move to logic (not part of state)
    get maxEnergy(): number {
        return getConstant(this.constants, 'maxEnergy');
    }
    get maxAfterBurner(): number {
        return getConstant(this.constants, 'maxAfterBurner');
    }
    get afterBurnerCharge(): number {
        return getConstant(this.constants, 'afterBurnerCharge');
    }
    get afterBurnerEnergyCost(): number {
        return getConstant(this.constants, 'afterBurnerEnergyCost');
    }
    get energyPerSecond(): number {
        return getConstant(this.constants, 'energyPerSecond');
    }
    get rotationCapacity(): number {
        return getConstant(this.constants, 'rotationCapacity');
    }
    get rotationEnergyCost(): number {
        return getConstant(this.constants, 'rotationEnergyCost');
    }
    get antiDriftEffectFactor(): number {
        return getConstant(this.constants, 'antiDriftEffectFactor');
    }
    get breaksEffectFactor(): number {
        return getConstant(this.constants, 'breaksEffectFactor');
    }
    get rotationEffectFactor(): number {
        return getConstant(this.constants, 'rotationEffectFactor');
    }
    get turnSpeedCapacity(): number {
        return this.rotationCapacity * this.rotationEffectFactor;
    }
    get shipAreas(): number {
        return getConstant(this.constants, 'shipAreas');
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
        return (
            getConstant(this.constants, 'maxSpeed') +
            afterBurner * getConstant(this.constants, 'maxSpeeFromAfterBurner')
        );
    }

    get maxSpeed() {
        return this.getMaxSpeedForAfterburner(this.afterBurner);
    }
    get maxMaxSpeed() {
        return this.getMaxSpeedForAfterburner(1);
    }
}
