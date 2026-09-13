import { GameStatus } from '@starwards/core';
import { computeSeatView } from '../src/screens/station-seat-view';

// Issue #2242: the generic seat (`station.html`) renders its assigned screen only while a
// game/replay is actually running; otherwise (stopped, starting, stopping, or simply unassigned)
// it falls back to the waiting screen. The waiting screen's Lobby breakout is offered only while
// the seat holds no assignment at all — an assigned-but-waiting seat (game stopped) stays put so
// the GM's assignment survives a restart.
describe('computeSeatView', () => {
    it('shows the assigned screen only when assigned and a game is running', () => {
        expect(computeSeatView('GVTS', 'pilot', GameStatus.RUNNING)).toEqual({
            view: 'assigned',
            showBreakout: false,
        });
    });

    it('shows the assigned screen while watching a replay too', () => {
        expect(computeSeatView('GVTS', 'pilot', GameStatus.REPLAY)).toEqual({
            view: 'assigned',
            showBreakout: false,
        });
    });

    it('falls back to waiting, without breakout, when assigned but the game is stopped', () => {
        expect(computeSeatView('GVTS', 'pilot', GameStatus.STOPPED)).toEqual({
            view: 'waiting',
            showBreakout: false,
        });
    });

    it('falls back to waiting, without breakout, while the game is starting or stopping', () => {
        expect(computeSeatView('GVTS', 'pilot', GameStatus.STARTING)).toEqual({
            view: 'waiting',
            showBreakout: false,
        });
        expect(computeSeatView('GVTS', 'pilot', GameStatus.STOPPING)).toEqual({
            view: 'waiting',
            showBreakout: false,
        });
    });

    it('shows the waiting screen with a breakout when the seat holds no assignment at all', () => {
        expect(computeSeatView('', '', GameStatus.RUNNING)).toEqual({
            view: 'waiting',
            showBreakout: true,
        });
        expect(computeSeatView('', '', GameStatus.STOPPED)).toEqual({
            view: 'waiting',
            showBreakout: true,
        });
    });

    it('offers the breakout when the GM never gave the seat a station type', () => {
        expect(computeSeatView('GVTS', '', GameStatus.RUNNING)).toEqual({
            view: 'waiting',
            showBreakout: true,
        });
    });

    it('hides the breakout once the GM has claimed the seat, even before a shipId resolves', () => {
        // The real post-stop shape: reconciliation clears shipId the instant playerShipIds
        // empties, but leaves stationType set so the seat can auto-resolve a new ship on restart.
        expect(computeSeatView('', 'pilot', GameStatus.STOPPED)).toEqual({
            view: 'waiting',
            showBreakout: false,
        });
    });
});
