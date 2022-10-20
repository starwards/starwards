import { ArraySchema, Schema, type } from '@colyseus/schema';

import { number2Digits } from '../number-field';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    @type(['string'])
    shipIds = new ArraySchema<string>();

    @number2Digits
    speed = 1;
}
