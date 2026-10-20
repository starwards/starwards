import { botSeatsConflict, multiplexedStations, rosterSeats, seatOfScreen, seatScreens } from './stations-manifest';

describe('bridge seat table', () => {
    it('lists every seat on the roster, the bot-only tactical and captain seats last', () => {
        expect(rosterSeats).toEqual(['pilot', 'weapons', 'engineer', 'sigint', 'tactical', 'captain']);
    });

    it('gives sigint three screens', () => {
        expect(seatScreens('sigint')).toEqual(['signals', 'dradis', 'target-details']);
    });

    it('maps a screen to its roster seat', () => {
        expect(seatOfScreen('dradis')).toBe('sigint');
        expect(seatOfScreen('helms')).toBe('pilot');
        expect(seatOfScreen('gm')).toBeUndefined();
    });

    it('tactical conflicts with pilot and weapons only', () => {
        expect(botSeatsConflict('tactical', 'pilot')).toBe(true);
        expect(botSeatsConflict('weapons', 'tactical')).toBe(true);
        expect(botSeatsConflict('tactical', 'engineer')).toBe(false);
        expect(botSeatsConflict('pilot', 'weapons')).toBe(false);
        expect(botSeatsConflict('tactical', 'tactical')).toBe(false);
    });

    it('derives multiplexed stations from the seats that fuse stations', () => {
        expect(multiplexedStations).toEqual({ tactical: ['helms', 'weapons'] });
    });
});
