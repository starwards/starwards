import { ArraySchema, Schema } from '@colyseus/schema';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export enum GameStatus {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
    REPLAY,
}
export class AdminState extends Schema {
    @gameField('int8')
    gameStatus = GameStatus.STOPPED;

    /** True while the running game is being recorded to disk for later replay. */
    @gameField('boolean')
    isRecordingGame = false;

    @gameField(['string'])
    shipIds = new ArraySchema<string>();

    @gameField(['string'])
    playerShipIds = new ArraySchema<string>();

    /** Global time-scale multiplier applied to every subsystem's `deltaSeconds`. GM lever, defaults to real-time. */
    @range([0, 3])
    @tweakable('number')
    @gameField('float32')
    speed = 1;

    /** Free-text scenario/GM announcement, broadcast to every screen. Empty string = no message. */
    @tweakable('string')
    @gameField('string')
    message = '';

    get isGameRunning() {
        return this.gameStatus === GameStatus.RUNNING;
    }
}
