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
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type(ChainGun)
    chainGun!: ChainGun;

    @type('number')
    targetTurnSpeed = 0;
    @type('number')
    impulse = 0;
    @type('number')
    boost = 0;
    @type('number')
    strafe = 0;
    @type('number')
    antiDrift = 0;
    @type('number')
    breaks = 0;
    @type('number')
    energy = 1000;

    @type('string')
    public targetId: string | null = null;

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
}

export * from './commands';
export * from './chain-gun';
