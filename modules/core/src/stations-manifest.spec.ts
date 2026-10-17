import { multiplexedStations, rosterSeats, seatOfScreen, seatScreens } from './stations-manifest';

describe('bridge seat table', () => {
    it('lists the roster seats without the bot-only seat', () => {
        expect(rosterSeats).toEqual(['pilot', 'weapons', 'engineer', 'sigint']);
    });

    it('gives sigint three screens', () => {
        expect(seatScreens('sigint')).toEqual(['signals', 'dradis', 'target-details']);
    });

    it('maps a screen to its roster seat', () => {
        expect(seatOfScreen('dradis')).toBe('sigint');
        expect(seatOfScreen('helms')).toBe('pilot');
        expect(seatOfScreen('gm')).toBeUndefined();
    });

    it('derives multiplexed stations from seats whose bot station is not one of their screens', () => {
        expect(multiplexedStations).toEqual({ tactical: ['helms', 'weapons'] });
    });
});
