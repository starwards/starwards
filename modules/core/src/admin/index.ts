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

/** Default seconds a queued message shows (wall-clock). Pending Amir's ruling. */
export const MESSAGE_DISPLAY_SECONDS = 8;

/** Seconds a GM-typed message (tweak edit) holds the screen: until cleared, yielding to queued ones. Pending Amir's ruling. */
export const GM_MESSAGE_SECONDS = Infinity;

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
     * The announcement on screen now, broadcast to every station. Empty string = none. Advanced by
     * {@link tickMessages} from the server-side queue fed by {@link pushMessage}. A direct write (GM
     * tweak) is picked up on the next tick as a GM message: recorded in history and shown at once.
     */
    @tweakable('string')
    @gameField('string')
    message = '';

    /** Every message announced this game, oldest first, capped at {@link MESSAGE_HISTORY_LIMIT}. Cleared on game stop. */
    @gameField([GameMessage])
    messageHistory = new ArraySchema<GameMessage>();

    private messageSeq = 0;
    /** Messages waiting for the screen, oldest first (server only). */
    private messageQueue: { text: string; seconds: number }[] = [];
    /** Seconds the current {@link message} still shows; `Infinity` holds it until cleared or queue pressure. */
    private messageSecondsLeft = 0;
    /** What {@link tickMessages} last put on screen; a different {@link message} means an outside (GM) write. */
    private shownMessage = '';

    /**
     * Queues `text` for every screen and records it in {@link messageHistory}. It shows after the
     * messages queued before it, for `seconds` (default {@link MESSAGE_DISPLAY_SECONDS}; `Infinity` =
     * until cleared, or until a later message waits {@link MESSAGE_DISPLAY_SECONDS}). Blank text is ignored.
     */
    pushMessage(text: string, seconds = MESSAGE_DISPLAY_SECONDS) {
        if (text.trim().length === 0) return;
        this.recordMessage(text);
        if (!this.messageQueue.length && !this.message && !this.shownMessage) {
            // nothing on screen or waiting: show at once, so a lone message needs no tick
            this.messageSecondsLeft = seconds;
            this.show(text);
        } else {
            this.messageQueue.push({ text, seconds });
        }
    }

    /**
     * Shows `text` now, replacing the current message (queued ones still follow), and records it in
     * {@link messageHistory}. Held until cleared, or until a queued message waits {@link MESSAGE_DISPLAY_SECONDS}.
     */
    showMessageNow(text: string, seconds = GM_MESSAGE_SECONDS) {
        if (text.trim().length === 0) return;
        this.recordMessage(text);
        this.messageSecondsLeft = seconds;
        this.show(text);
    }

    /** Clears the current {@link message}; the next queued one shows on the next tick. History is kept. */
    clearMessage() {
        this.messageSecondsLeft = 0;
        this.show('');
    }

    /** Clears current message, queue and history (game stop). */
    resetMessages() {
        this.messageQueue = [];
        this.messageSecondsLeft = 0;
        this.show('');
        this.messageHistory.splice(0);
        this.messageSeq = 0;
    }

    /** Pending messages not yet shown. */
    get queuedMessages(): readonly string[] {
        return this.messageQueue.map((m) => m.text);
    }

    /**
     * Advances the message queue by `deltaSeconds` (wall-clock, so it runs while the game is paused).
     * A GM write to {@link message} since the last tick becomes a GM message: recorded, held on screen.
     */
    tickMessages(deltaSeconds: number) {
        if (this.message !== this.shownMessage) {
            if (this.message.trim().length === 0) {
                this.clearMessage();
            } else {
                this.showMessageNow(this.message);
            }
        }
        // a held message yields once another one has waited the default display time
        const left = this.messageQueue.length
            ? Math.min(this.messageSecondsLeft, MESSAGE_DISPLAY_SECONDS)
            : this.messageSecondsLeft;
        this.messageSecondsLeft = left - deltaSeconds;
        if (this.messageSecondsLeft > 0) return;
        const next = this.messageQueue.shift();
        this.messageSecondsLeft = next?.seconds ?? 0;
        this.show(next?.text ?? '');
    }

    private show(text: string) {
        this.shownMessage = text;
        this.message = text;
    }

    private recordMessage(text: string) {
        const entry = new GameMessage();
        entry.text = text;
        entry.seq = ++this.messageSeq;
        this.messageHistory.push(entry);
        if (this.messageHistory.length > MESSAGE_HISTORY_LIMIT) {
            this.messageHistory.splice(0, this.messageHistory.length - MESSAGE_HISTORY_LIMIT);
        }
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

/**
 * `broadcastMessage` command: the GM sends `value` to every station. It joins the message queue
 * ({@link AdminState.pushMessage}) and the history like any other announcement.
 */
export const broadcastMessage: StateCommand<string, AdminState, void> = {
    cmdName: 'broadcastMessage',
    setValue: (state, value) => {
        if (typeof value === 'string') state.pushMessage(value);
    },
};
