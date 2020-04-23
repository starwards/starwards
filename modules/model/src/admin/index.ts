import { Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('number')
    x: number = 123;
}

export * from './commands';
