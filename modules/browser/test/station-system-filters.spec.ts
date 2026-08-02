import { isPilotSystem, isWeaponsSystem } from '../src/screens/station-system-filters';

describe('isPilotSystem', () => {
    test('matches both radar instances', () => {
        expect(isPilotSystem('/radars/0')).toBe(true);
        expect(isPilotSystem('/radars/1')).toBe(true);
    });

    test('matches the other pilot-relevant systems', () => {
        expect(isPilotSystem('/thrusters/0')).toBe(true);
        expect(isPilotSystem('/warp')).toBe(true);
        expect(isPilotSystem('/maneuvering')).toBe(true);
        expect(isPilotSystem('/smartPilot')).toBe(true);
    });

    test('does not match the stale singular pointer or unrelated systems', () => {
        expect(isPilotSystem('/radar')).toBe(false);
        expect(isPilotSystem('/chainGuns/0')).toBe(false);
        expect(isPilotSystem('/magazine')).toBe(false);
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
