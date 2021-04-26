import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import { Spaceship, Vec2 } from '../space';

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
    get afterBurnerCapacity(): number {
        return getConstant(this.constants, 'afterBurnerCapacity');
    }
    get afterBurnerEffectFactor(): number {
        return getConstant(this.constants, 'afterBurnerEffectFactor');
    }
    get energyPerSecond(): number {
        return getConstant(this.constants, 'energyPerSecond');
    }
    get maneuveringCapacity(): number {
        return getConstant(this.constants, 'maneuveringCapacity');
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
    get boostEffectFactor(): number {
        return getConstant(this.constants, 'boostEffectFactor');
    }
    get strafeEffectFactor(): number {
        return getConstant(this.constants, 'strafeEffectFactor');
    }
    get rotationCapacity(): number {
        return (
            this.maneuveringCapacity * this.rotationEffectFactor +
            this.afterBurner * this.afterBurnerCapacity * this.afterBurnerEffectFactor
        );
    }
    *angleThrusters(direction: ShipDirection) {
        for (const thruster of this.thrusters) {
            if (toDegreesDelta(direction) === toDegreesDelta(thruster.angle)) {
                yield thruster;
            }
        }
    }

    thrusterCapacity(direction: ShipDirection) {
        const afterBurnerFactor = this.afterBurner * this.afterBurnerCapacity * this.afterBurnerEffectFactor;
        return (
            [...this.angleThrusters(direction)].reduce((s, t) => s + t.capacity * t.speedFactor, 0) + afterBurnerFactor
        );
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
