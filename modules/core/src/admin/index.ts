import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';
import { AssignBotArg, BotAssignable, ShipBots } from './bots';
import { AssignStationArg, RegisterStationArg, StationRegistrable, StationRegistryEntry } from '../stations';

import { StateCommand } from '../commands';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export * from './bots';

export enum GameStatus {
    STOPPED,
    STARTING,
    RUNNING,
    STOPPING,
}
/** One entry of {@link AdminState.messageHistory}. */
export class GameMessage extends Schema {
    @gameField('string')
    text = '';

    /** Monotonic per-game sequence number, starting at 1. */
    @gameField('uint32')
    seq = 0;
}

/** Max entries kept in {@link AdminState.messageHistory}; oldest are dropped first. */
export const MESSAGE_HISTORY_LIMIT = 50;

export class AdminState extends Schema implements StationRegistrable, BotAssignable {
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

    /**
     * Bots the GM seated, by ship id. Live only: reset when the game stops, never saved, and
     * never entries of {@link stations}.
     */
    @gameField({ map: ShipBots })
    bots = new MapSchema<ShipBots>();

    public assignBotCommands = Array.of<AssignBotArg>();

    /** Set by {@link resetAssignments}; `GameManager.update()` clears it once applied. */
    public resetAssignmentsRequested = false;

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

    /**
     * Current (latest pushed) scenario/GM announcement, broadcast to every screen. Empty string =
     * no current message. Stations render this. Prefer {@link pushMessage}, which also records
     * history; setting this directly (GM tweak) changes only the current text.
     */
    @tweakable('string')
    @gameField('string')
    message = '';

    /** Every message pushed this game, oldest first, capped at {@link MESSAGE_HISTORY_LIMIT}. Cleared on game stop. */
    @gameField([GameMessage])
    messageHistory = new ArraySchema<GameMessage>();

    private messageSeq = 0;

    /** Appends `text` to {@link messageHistory} and makes it the current {@link message}. Blank text is ignored. */
    pushMessage(text: string) {
        if (text.trim().length === 0) return;
        const entry = new GameMessage();
        entry.text = text;
        entry.seq = ++this.messageSeq;
        this.messageHistory.push(entry);
        if (this.messageHistory.length > MESSAGE_HISTORY_LIMIT) {
            this.messageHistory.splice(0, this.messageHistory.length - MESSAGE_HISTORY_LIMIT);
        }
        this.message = text;
    }

    /** Clears the current {@link message}; history is kept. */
    clearMessage() {
        this.message = '';
    }

    /** Clears current message and history (game stop). */
    resetMessages() {
        this.message = '';
        this.messageHistory.splice(0);
        this.messageSeq = 0;
    }

    get isGameRunning() {
        return this.gameStatus === GameStatus.RUNNING;
    }
}

/**
 * `resetAssignments` command: the GM clears every station assignment, disconnected sticky ones
 * included, and stops every bot on every ship.
 */
export const resetAssignments: StateCommand<unknown, AdminState, void> = {
    cmdName: 'resetAssignments',
    setValue: (state) => {
        state.resetAssignmentsRequested = true;
    },
};
