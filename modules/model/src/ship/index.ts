import { Schema, type } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';

export class ShipState extends Schema {
    @type('number')
    targetTurnSpeed = 0;
    @type('number')
    energy = 1000;

    public events = new EventEmitter();
    constructor(isClient = true) {
        super();
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
