import { type, MapSchema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Spaceship } from '../space';
import { ChainGun } from './chain-gun';

export enum TargetedStatus {
    NONE,
    LOCKED,
    FIRED_UPON,
}
export class ShipState extends Spaceship {
    @type({ map: 'float32' })
    constants!: MapSchema<number>;

    @type(ChainGun)
    chainGun!: ChainGun;

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

    public events = new EventEmitter();
    constructor(isClient = true) {
        super();
        if (isClient) {
            this.onChange = (changes) => {
                for (const { field, value } of changes) {
                    this.events.emit(field, value);
                }
            };
            this.events.once('constants', () => {
                this.constants.onChange = (value: number, key: string) => {
                    this.events.emit('constants.' + key, value);
                    this.events.emit('constants');
                };
            });
            this.position.onChange = (_) => this.events.emit('position', this.position);
            this.velocity.onChange = (_) => this.events.emit('velocity', this.velocity);
            this.events.once('chainGun', () => {
                this.chainGun.onChange = (changes) => {
                    changes.forEach((c) => {
                        this.events.emit('chainGun.' + c.field, c.value);
                    });
                };
                this.chainGun.constants.onChange = (value: number, key: string) => {
                    this.events.emit('chainGun.constants.' + key, value);
                    this.events.emit('chainGun.constants');
                };
            });
        }
    }
    get maxEnergy() {
        return this.constants.get('maxEnergy');
    }
    get maxReserveSpeed() {
        return this.constants.get('maxReserveSpeed');
    }
    get reserveSpeedCharge() {
        return this.constants.get('reserveSpeedCharge');
    }
    get reserveSpeedEnergyCost() {
        return this.constants.get('reserveSpeedEnergyCost');
    }
    get reserveSpeedUsagePerSecond() {
        return this.constants.get('reserveSpeedUsagePerSecond');
    }
    get energyPerSecond() {
        return this.constants.get('energyPerSecond');
    }
    get maneuveringCapacity() {
        return this.constants.get('maneuveringCapacity');
    }
    get maneuveringEnergyCost() {
        return this.constants.get('maneuveringEnergyCost');
    }
    get antiDriftEffectFactor() {
        return this.constants.get('antiDriftEffectFactor');
    }
    get breaksEffectFactor() {
        return this.constants.get('breaksEffectFactor');
    }
    get rotationEffectFactor() {
        return this.constants.get('rotationEffectFactor');
    }
    get boostEffectFactor() {
        return this.constants.get('boostEffectFactor');
    }
    get strafeEffectFactor() {
        return this.constants.get('strafeEffectFactor');
    }
    get rotationCapacity() {
        return this.maneuveringCapacity * this.rotationEffectFactor;
    }
    get movementCapacity() {
        return this.maneuveringCapacity * Math.max(this.boostEffectFactor, this.strafeEffectFactor);
    }
    get boostCapacity() {
        return this.maneuveringCapacity * this.boostEffectFactor;
    }
    get strafeCapacity() {
        return this.maneuveringCapacity * this.strafeEffectFactor;
    }
}
