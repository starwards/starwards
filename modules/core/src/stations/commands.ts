import { Schema } from '@colyseus/schema';

import { StateCommand } from '../commands';

/**
 * A station's registration/self-assignment request: who it is, what type of seat it is, and
 * which ship it asks to bind to (empty `shipId` = just (re)registering, no assignment request).
 */
export type RegisterStationArg = { stationId: string; stationType: string; shipId: string };

export interface StationRegistrable {
    /** Drained by `GameManager.update()`: registration/self-assignment requests. */
    registerStationCommands: RegisterStationArg[];
    /** Drained by `GameManager.update()`: station ids whose client just left the admin room. */
    disconnectStationCommands: string[];
}

/**
 * `registerStation` command: a station (re)registers itself and optionally requests a ship
 * assignment. Generic, like every other command in this codebase (see the "Commands" pattern
 * in CLAUDE.md) — `setValue` only pushes onto the queue. Only a Starwards-specific manager can
 * validate a requested shipId against `playerShipIds` and the stations manifest, so that
 * validation happens where the queue is drained (`GameManager`), not here.
 */
export const registerStation: StateCommand<RegisterStationArg, Schema & StationRegistrable, void> = {
    cmdName: 'registerStation',
    setValue: (state, value) => {
        state.registerStationCommands.push(value);
    },
};

/**
 * Server->client message name for a rejected `registerStation` request: the requested
 * `stationId` is currently `connected` under a different Colyseus session (a collision, e.g.
 * two tabs that happened to share the same seeded id). Sent to the rejected client only —
 * see `AdminRoom`'s collision check — so it can generate a fresh id and retry instead of
 * silently overwriting the other station's connection.
 */
export const REGISTER_STATION_REJECTED = 'registerStationRejected';

export type RegisterStationRejected = { stationId: string };
