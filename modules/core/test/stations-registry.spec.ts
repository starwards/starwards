import { StationRegistryEntry, upsertStationRegistration } from '../src';
import { MapSchema } from '@colyseus/schema';

// Issue #2131 review: the lobby registers a device's tab id with an empty `stationType` (it's
// not a bridge seat). Overwriting a real seat's type with '' would make its slot look invalid
// and wipe its sticky ship assignment on the next reconcile — see GameManager.

describe('upsertStationRegistration', () => {
    it('records the station type on first registration', () => {
        const stations = new MapSchema<StationRegistryEntry>();
        const entry = upsertStationRegistration(stations, 'AAA', 'pilot');
        expect(entry).toMatchObject({ id: 'AAA', connected: true, stationType: 'pilot' });
    });

    it('updates the station type on a genuine re-registration under a new type', () => {
        const stations = new MapSchema<StationRegistryEntry>();
        upsertStationRegistration(stations, 'AAA', 'pilot');
        const entry = upsertStationRegistration(stations, 'AAA', 'weapons');
        expect(entry.stationType).toBe('weapons');
    });

    it('does not overwrite an existing station type with an empty one (lobby registration)', () => {
        const stations = new MapSchema<StationRegistryEntry>();
        upsertStationRegistration(stations, 'AAA', 'pilot');
        const entry = upsertStationRegistration(stations, 'AAA', '');
        expect(entry.stationType).toBe('pilot');
        expect(entry.connected).toBe(true);
    });
});
