import { Schema, type, MapSchema } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    @type({ map: 'uint8' })
    points!: MapSchema<number>;
}

export * from './commands';
