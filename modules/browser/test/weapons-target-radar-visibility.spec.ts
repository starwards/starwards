import { isWeaponsTargetOutOfRange } from '../src/radar/weapons-target-radar-visibility';

describe('isWeaponsTargetOutOfRange', () => {
    const center = { x: 0, y: 0 };
    const far = { id: 'enemy', position: { x: 2000, y: 0 } };
    const near = { id: 'enemy', position: { x: 500, y: 0 } };

    it('shows the locked target when beyond range', () => {
        expect(isWeaponsTargetOutOfRange(far, 'enemy', center, 1000)).toBe(true);
    });
    it('hides the locked target when within range', () => {
        expect(isWeaponsTargetOutOfRange(near, 'enemy', center, 1000)).toBe(false);
    });
    it('hides objects that are not the locked target', () => {
        expect(isWeaponsTargetOutOfRange(far, 'other', center, 1000)).toBe(false);
    });
    it('hides everything when no target is locked', () => {
        expect(isWeaponsTargetOutOfRange(far, '', center, 1000)).toBe(false);
        expect(isWeaponsTargetOutOfRange(far, null, center, 1000)).toBe(false);
    });
});
