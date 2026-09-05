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

    describe('getOrCreateStationId', () => {
        it('generates and persists an id on first use', () => {
            const storage = makeMemoryStorage();
            const id = getOrCreateStationId(storage);
            expect(id).toHaveLength(3);
            expect(storage.getItem('starwards.stationId')).toBe(id);
        });

        it('reuses the persisted id on subsequent calls', () => {
            const storage = makeMemoryStorage({ 'starwards.stationId': 'XYZ' });
            expect(getOrCreateStationId(storage)).toBe('XYZ');
            expect(getOrCreateStationId(storage)).toBe('XYZ');
        });
    });

    describe('setStationId', () => {
        it('persists a normalized (upper-case) id', () => {
            const storage = makeMemoryStorage();
            setStationId('nav-2', storage);
            expect(storage.getItem('starwards.stationId')).toBe('NAV-2');
            expect(getOrCreateStationId(storage)).toBe('NAV-2');
        });
    });
});
