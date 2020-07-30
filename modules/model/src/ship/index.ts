import { type, MapSchema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Spaceship } from '../space';
import { AutoCannon } from './auto-cannon';

export class ShipState extends Spaceship {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    @type(AutoCannon)
    autoCannon!: AutoCannon;

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

    public events = new EventEmitter();
    constructor(isClient = true) {
        super();
        if (isClient) {
            this.onChange = (changes) => {
                changes.forEach((c) => {
                    this.events.emit(c.field, c.value);
                });
            };
            this.events.once('autoCannon', () => {
                this.autoCannon.onChange = (changes) => {
                    changes.forEach((c) => {
                        this.events.emit('autoCannon.' + c.field, c.value);
                    });
                };
            });
        }
    }
}

export * from './commands';
export * from './auto-cannon';
