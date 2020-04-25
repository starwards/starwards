import { Schema, type } from '@colyseus/schema';

export class ShipState extends Schema {
    @type('string')
    id: string;

    constructor(id: string) {
        super();
        this.id = id;
    }
}

export * from './commands';
