import { isHelmsSystem, isWeaponsSystem } from '../src/screens/station-system-filters';

describe('isHelmsSystem', () => {
    test('matches both radar instances', () => {
        expect(isHelmsSystem('/radars/0')).toBe(true);
        expect(isHelmsSystem('/radars/1')).toBe(true);
    });

    test('matches the other pilot-relevant systems', () => {
        expect(isHelmsSystem('/thrusters/0')).toBe(true);
        expect(isHelmsSystem('/warp')).toBe(true);
        expect(isHelmsSystem('/maneuvering')).toBe(true);
        expect(isHelmsSystem('/smartPilot')).toBe(true);
    });

    test('does not match the stale singular pointer or unrelated systems', () => {
        expect(isHelmsSystem('/radar')).toBe(false);
        expect(isHelmsSystem('/chainGuns/0')).toBe(false);
        expect(isHelmsSystem('/magazine')).toBe(false);
    });
});

describe('isWeaponsSystem', () => {
    test('matches both radar instances', () => {
        expect(isWeaponsSystem('/radars/0')).toBe(true);
        expect(isWeaponsSystem('/radars/1')).toBe(true);
    });

    test('matches the other weapons-relevant systems', () => {
        expect(isWeaponsSystem('/tubes/0')).toBe(true);
        expect(isWeaponsSystem('/chainGuns/0')).toBe(true);
        expect(isWeaponsSystem('/magazine')).toBe(true);
    });

    test('does not match the stale singular pointer or unrelated systems', () => {
        expect(isWeaponsSystem('/radar')).toBe(false);
        expect(isWeaponsSystem('/thrusters/0')).toBe(false);
        expect(isWeaponsSystem('/warp')).toBe(false);
    });
});
