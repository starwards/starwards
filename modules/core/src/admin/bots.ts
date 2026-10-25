import { MapSchema, Schema } from '@colyseus/schema';

import { StateCommand } from '../commands';
import { gameField } from '../game-field';

/** Brains the GM can seat. Jev brains are added here; the roster lists whatever this holds. */
/** `guard` is the harness's guard crew (the default); `reference` plays every seat's v1 brain. */
export const botBrains = ['guard', 'reference'] as const;
export type BotBrain = (typeof botBrains)[number];
export const isBotBrain = (b: string): b is BotBrain => (botBrains as readonly string[]).includes(b);

export const botStatuses = ['starting', 'running', 'failed'] as const;
export type BotStatus = (typeof botStatuses)[number];

/** A bot holding one seat of one ship. Never a station-registry entry. */
export class BotEntry extends Schema {
    /** `bot-<seat>-<n>`, from a server-wide counter. */
    @gameField('string') id = '';
    /** One of {@link botBrains}. */
    @gameField('string') brain = '';
    /** One of {@link botStatuses}. */
    @gameField('string') status: BotStatus = 'starting';
    /** Why the bot failed; empty otherwise. */
    @gameField('string') message = '';
}

/** One ship's bots, keyed by seat. */
export class ShipBots extends Schema {
    /** Keyed by bridge seat. */
    @gameField({ map: BotEntry }) seats = new MapSchema<BotEntry>();
}

/** `brain: 'none'` stops the seat's bot. */
export type AssignBotArg = { shipId: string; seat: string; brain: string };

export interface BotAssignable {
    /** Drained by `GameManager.update()`: GM-issued bot assignments (see `assignBot`). */
    assignBotCommands: AssignBotArg[];
}

/** `assignBot` command: the GM seats a bot of `brain` at a ship's seat, or stops it (`brain: 'none'`). */
export const assignBot: StateCommand<AssignBotArg, Schema & BotAssignable, void> = {
    cmdName: 'assignBot',
    setValue: (state, value) => {
        state.assignBotCommands.push(value);
    },
};
