import { isOwnWaypoint } from '../src/radar/waypoint-radar-visibility';

describe('isOwnWaypoint', () => {
    test('matches a waypoint owned by this ship, regardless of collection', () => {
        expect(isOwnWaypoint({ owner: 'ship-1', collection: 'route' }, 'ship-1')).toBe(true);
        expect(isOwnWaypoint({ owner: 'ship-1', collection: '' }, 'ship-1')).toBe(true);
        expect(isOwnWaypoint({ owner: 'ship-1', collection: 'alpha' }, 'ship-1')).toBe(true);
    });

    test('does not match a waypoint owned by another ship', () => {
        expect(isOwnWaypoint({ owner: 'ship-2', collection: 'route' }, 'ship-1')).toBe(false);
    });

    test('does not match an unowned waypoint', () => {
        expect(isOwnWaypoint({ owner: null, collection: 'route' }, 'ship-1')).toBe(false);
    });
});
