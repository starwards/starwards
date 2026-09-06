import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import { AssignStationArg, RegisterStationArg, StationRegistrable, StationRegistryEntry } from '../stations';

import { commandable, gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export enum GameStatus {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
    REPLAY,
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

    /** Seconds into the recording currently being replayed. Meaningless unless `gameStatus` is `REPLAY`. */
    @gameField('float32')
    replayPosition = 0;

    /** Full length in seconds of the recording currently being replayed. 0 while not replaying. */
    @gameField('float32')
    replayDuration = 0;

    /**
     * Seek request, in recording seconds; -1 when there is nothing to seek. Drained by the
     * replay player on its next tick — a seek has to reopen the recording, so it can't be a
     * plain write to {@link replayPosition}.
     */
    @commandable()
    @gameField('float32')
    replaySeekCommand = -1;

    /** The replay reached its last frame and is holding there. Cleared by any seek. */
    @gameField('boolean')
    replayEnded = false;

    get isGameRunning() {
        return this.gameStatus === GameStatus.RUNNING;
    }
}
