import { Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning: boolean = false;
}

export * from './commands';
