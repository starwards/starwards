import { type, MapSchema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Spaceship, Vec2 } from '../space';

export class ShipState extends Spaceship {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type('number')
    targetTurnSpeed = 0;
    @type('number')
    impulse = 0;
    @type('number')
    strafe = 0;
    @type('number')
    antiDrift = 0;
    @type('number')
    energy = 1000;

    public events = new EventEmitter();
    constructor(isClient = true) {
        super('', new Vec2(), 0);
        if (isClient) {
            this.onChange = (changes) => {
                changes.forEach((c) => {
                    this.events.emit(c.field, c.value);
                });
            };
        }
    }
}

export * from './commands';
