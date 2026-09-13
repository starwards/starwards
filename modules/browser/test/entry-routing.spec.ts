import { GameStatus } from '@starwards/core';
import { shouldRedirectToStation } from '../src/entry-routing';

// Issue #2242: a tab loading `index.html` while a game (or replay) is already running belongs on
// its bridge seat, not the ship-picking lobby — unless `?lobby` asks to stay.
describe('shouldRedirectToStation', () => {
    it('redirects when a game is running and there is no `?lobby` override', () => {
        expect(shouldRedirectToStation(GameStatus.RUNNING, false)).toBe(true);
    });

    it('redirects when a replay is running and there is no `?lobby` override', () => {
        expect(shouldRedirectToStation(GameStatus.REPLAY, false)).toBe(true);
    });

    it('does not redirect when `?lobby` is present, even mid-game', () => {
        expect(shouldRedirectToStation(GameStatus.RUNNING, true)).toBe(false);
        expect(shouldRedirectToStation(GameStatus.REPLAY, true)).toBe(false);
    });

    it('does not redirect when no game is running', () => {
        expect(shouldRedirectToStation(GameStatus.STOPPED, false)).toBe(false);
        expect(shouldRedirectToStation(GameStatus.STARTING, false)).toBe(false);
        expect(shouldRedirectToStation(GameStatus.STOPPING, false)).toBe(false);
    });
});
