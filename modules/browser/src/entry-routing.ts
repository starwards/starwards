import { GameStatus } from '@starwards/core';

/**
 * Issue #2242: a tab loading the lobby (`index.html`) while a game or replay is already running
 * belongs on its bridge seat (`station.html`), not the ship-picking lobby — unless the url carries
 * `?lobby`, which asks to stay. Evaluated once on load, not kept in sync afterward: an already-open
 * lobby tab stays put when a game starts mid-session.
 */
export function shouldRedirectToStation(gameStatus: GameStatus, hasLobbyParam: boolean): boolean {
    return !hasLobbyParam && (gameStatus === GameStatus.RUNNING || gameStatus === GameStatus.REPLAY);
}
