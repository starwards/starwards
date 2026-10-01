import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import { AssignStationArg, RegisterStationArg, StationRegistrable, StationRegistryEntry } from '../stations';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export enum GameStatus {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
}
export class AdminState extends Schema implements StationRegistrable {
    @gameField('int8')
    gameStatus = GameStatus.STOPPED;

    /**
     * The station registry: every connected browser/MCP station, keyed by its persistent
     * station id. Survives game stop/start/load — `GameManager` never resets this field, only
     * re-validates entries' assignments (see `stations/` for the generic registry logic).
     */
    @gameField({ map: StationRegistryEntry })
    stations = new MapSchema<StationRegistryEntry>();

    public registerStationCommands = Array.of<RegisterStationArg>();
    public disconnectStationCommands = Array.of<string>();
    public assignStationCommands = Array.of<AssignStationArg>();

    /** True while the running game is being recorded to disk for later replay. */
    @gameField('boolean')
    isRecordingGame = false;

    /** Seconds of game time captured by the recording in progress. 0 while not recording. */
    @gameField('float32')
    recordingSeconds = 0;

    /** File name of the recording in progress. Empty string while not recording. */
    @gameField('string')
    recordingName = '';

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
