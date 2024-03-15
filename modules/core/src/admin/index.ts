import { ArraySchema, Schema } from '@colyseus/schema';

import { gameField } from '../game-field';

export enum GameStatus {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
}
export class AdminState extends Schema {
    @gameField('int8')
    gameStatus = GameStatus.STOPPED;

    @gameField(['string'])
    shipIds = new ArraySchema<string>();

    @gameField(['string'])
    playerShipIds = new ArraySchema<string>();

    @gameField('float32')
    speed = 1;

    get isGameRunning() {
        return this.gameStatus === GameStatus.RUNNING;
    }
}
