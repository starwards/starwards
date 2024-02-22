import { ArraySchema, Schema } from '@colyseus/schema';

import { gameField } from '../game-field';

export class AdminState extends Schema {
    @gameField('boolean')
    isGameRunning = false;

    @gameField(['string'])
    shipIds = new ArraySchema<string>();

    @gameField('float32')
    speed = 1;
}
