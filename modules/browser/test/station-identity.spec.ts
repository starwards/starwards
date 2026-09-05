import {
    StationIdStorage,
    generateStationId,
    getOrCreateStationId,
    isValidStationId,
    setStationId,
} from '../src/station-identity';

function makeMemoryStorage(initial: Record<string, string> = {}): StationIdStorage {
    const data = new Map(Object.entries(initial));
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
    };
}

describe('station-identity', () => {
    describe('generateStationId', () => {
        it('generates a 3-character upper-case id with no ambiguous characters', () => {
            for (let i = 0; i < 200; i++) {
                const id = generateStationId();
                expect(id).toHaveLength(3);
                expect(id).toEqual(id.toUpperCase());
                expect(id).not.toMatch(/[0O1IL]/);
            }
        });
    });

    describe('isValidStationId', () => {
        it('accepts 1-16 char alphanumeric-and-dash ids', () => {
            expect(isValidStationId('A')).toBe(true);
            expect(isValidStationId('NAV')).toBe(true);
            expect(isValidStationId('nav-2')).toBe(true);
            expect(isValidStationId('A'.repeat(16))).toBe(true);
        });

        it('rejects empty, overlong, or invalid-character ids', () => {
            expect(isValidStationId('')).toBe(false);
            expect(isValidStationId('A'.repeat(17))).toBe(false);
            expect(isValidStationId('nav station')).toBe(false);
            expect(isValidStationId('nav_2')).toBe(false);
        });
    });

    // Issue #2131 review: identity must be per-tab (sessionStorage), with a machine-sticky
    // default (localStorage) and a `?station=` url override.
    describe('getOrCreateStationId', () => {
        it('generates a fresh id and persists it to both storages when neither has one', () => {
            const session = makeMemoryStorage();
            const local = makeMemoryStorage();
            const id = getOrCreateStationId(session, local, new URLSearchParams());
            expect(id).toHaveLength(3);
            expect(session.getItem('starwards.stationId')).toBe(id);
            expect(local.getItem('starwards.stationId')).toBe(id);
        });

        it("reuses this tab's sessionStorage id even when localStorage disagrees", () => {
            const session = makeMemoryStorage({ 'starwards.stationId': 'TAB' });
            const local = makeMemoryStorage({ 'starwards.stationId': 'OTHER' });
            expect(getOrCreateStationId(session, local, new URLSearchParams())).toBe('TAB');
        });

        it('seeds a fresh tab (no sessionStorage entry) from localStorage, recovering the machine-sticky default', () => {
            const session = makeMemoryStorage();
            const local = makeMemoryStorage({ 'starwards.stationId': 'MACHINE' });
            const id = getOrCreateStationId(session, local, new URLSearchParams());
            expect(id).toBe('MACHINE');
            expect(session.getItem('starwards.stationId')).toBe('MACHINE');
        });

        it('a `?station=` url param overrides both storages', () => {
            const session = makeMemoryStorage({ 'starwards.stationId': 'TAB' });
            const local = makeMemoryStorage({ 'starwards.stationId': 'MACHINE' });
            const id = getOrCreateStationId(session, local, new URLSearchParams('station=PINNED'));
            expect(id).toBe('PINNED');
            expect(session.getItem('starwards.stationId')).toBe('PINNED');
            expect(local.getItem('starwards.stationId')).toBe('PINNED');
        });
    });

    describe('setStationId', () => {
        it('persists a normalized (upper-case) id to both storages', () => {
            const session = makeMemoryStorage();
            const local = makeMemoryStorage();
            setStationId('nav-2', session, local);
            expect(session.getItem('starwards.stationId')).toBe('NAV-2');
            expect(local.getItem('starwards.stationId')).toBe('NAV-2');
        });
    });
});
