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
    impulse = 0;
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

    @type('int8')
    targeted = TargetedStatus.NONE;

    public events = new EventEmitter();
    constructor(isClient = true) {
        super();
        if (isClient) {
            this.onChange = (changes) => {
                changes.forEach((c) => {
                    this.events.emit(c.field, c.value);
                });
            };
            this.events.once('chainGun', () => {
                this.chainGun.onChange = (changes) => {
                    changes.forEach((c) => {
                        this.events.emit('chainGun.' + c.field, c.value);
                    });
                };
            });
        }
    }

    get rotationCapacity() {
        return this.maneuveringCapacity * this.rotationEffectFactor;
    }
    get rotationEffectFactor() {
        return this.constants.rotationEffectFactor as number;
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
    get boostEffectFactor() {
        return this.constants.boostEffectFactor as number;
    }
    get strafeEffectFactor() {
        return this.constants.strafeEffectFactor as number;
    }
    get maneuveringCapacity() {
        return this.constants.maneuveringCapacity as number;
    }
    get maneuveringEnergyCost() {
        return this.constants.maneuveringEnergyCost as number;
    }
}
