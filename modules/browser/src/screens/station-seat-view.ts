import { GameStatus } from '@starwards/core';

type SeatView = 'assigned' | 'waiting';

/**
 * Issue #2242: the generic seat (`station.html`) renders its `(shipId, stationType)` assignment
 * only while a game or replay is actually running. A stopped game must fall back here instead of
 * keeping the old screen up: `GameManager`'s per-tick reconciliation clears `shipId` the moment
 * `playerShipIds` empties (which `stopGame` does immediately), but deliberately leaves
 * `stationType` set — that's the GM's seat assignment, and it survives the stop so the seat can
 * auto-resolve a `shipId` again once a new game starts. So a stopped-but-claimed seat is seen here
 * as `shipId: ''`, `stationType: 'pilot'`, not both empty.
 *
 * The waiting screen's Lobby breakout is therefore keyed on `stationType` alone: it's offered only
 * for a seat the GM never gave a role at all, not for one merely waiting on its next `shipId`.
 */
export function computeSeatView(
    shipId: string,
    stationType: string,
    gameStatus: GameStatus,
): { view: SeatView; showBreakout: boolean } {
    const gameActive = gameStatus === GameStatus.RUNNING || gameStatus === GameStatus.REPLAY;
    return {
        view: shipId && stationType && gameActive ? 'assigned' : 'waiting',
        showBreakout: !stationType,
    };
}
