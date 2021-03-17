import { MapSchema, Schema, type } from '@colyseus/schema';
import { Spaceship, Vec2 } from '../space';

import { ChainGun } from './chain-gun';
import { getConstant } from '../utils';

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
    @type(Vec2)
    maneuvering: Vec2 = new Vec2(0, 0);

    readonly maxTargetAimOffset = 30;
    readonly maxTurnSpeed = 90;
}
export class ShipState extends Spaceship {
    @type({ map: 'float32' })
    constants!: MapSchema<number>;

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
    reserveSpeed = 1000;
    @type('float32')
    useReserveSpeed = 0;

    @type('int8')
    targeted = TargetedStatus.NONE;

    // server only, used for commands
    public nextTargetCommand = false;
    public rotationModeCommand = false;
    public maneuveringModeCommand = false;

    // TODO: move to logic (not part of state)
    get maxEnergy(): number {
        return getConstant(this.constants, 'maxEnergy');
    }
    get maxReserveSpeed(): number {
        return getConstant(this.constants, 'maxReserveSpeed');
    }
    get reserveSpeedCharge(): number {
        return getConstant(this.constants, 'reserveSpeedCharge');
    }
    get reserveSpeedEnergyCost(): number {
        return getConstant(this.constants, 'reserveSpeedEnergyCost');
    }
    get reserveSpeedUsagePerSecond(): number {
        return getConstant(this.constants, 'reserveSpeedUsagePerSecond');
    }
    get energyPerSecond(): number {
        return getConstant(this.constants, 'energyPerSecond');
    }
    get maneuveringCapacity(): number {
        return getConstant(this.constants, 'maneuveringCapacity');
    }
    get maneuveringEnergyCost(): number {
        return getConstant(this.constants, 'maneuveringEnergyCost');
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
            this.useReserveSpeed * this.reserveSpeedUsagePerSecond
        );
    }
    get boostCapacity() {
        return (
            this.maneuveringCapacity * this.boostEffectFactor + this.useReserveSpeed * this.reserveSpeedUsagePerSecond
        );
    }
    get strafeCapacity() {
        return (
            this.maneuveringCapacity * this.strafeEffectFactor + this.useReserveSpeed * this.reserveSpeedUsagePerSecond
        );
    }
    get maxSpeed() {
        return (
            getConstant(this.constants, 'maxSpeed') +
            this.useReserveSpeed * getConstant(this.constants, 'maxReservedSpeed')
        );
    }
    get maxMaxSpeed() {
        return getConstant(this.constants, 'maxSpeed') + getConstant(this.constants, 'maxReservedSpeed');
    }
}
