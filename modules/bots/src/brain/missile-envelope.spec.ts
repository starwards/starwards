import { MISSILE_MIN_LAUNCH_METERS, missileLaunchRange, rangeRate } from './missile-envelope';

describe('missile launch envelope', () => {
    it('reaches farther the faster the target closes', () => {
        expect(missileLaunchRange('HiExpMissile', 0)).toBe(45_000);
        expect(missileLaunchRange('HiExpMissile', 600)).toBe(70_000);
        expect(missileLaunchRange('HiExpMissile', 1200)).toBe(70_000);
        expect(missileLaunchRange('ArmPenMissile', 600)).toBe(65_000);
    });

    it('takes the shorter neighbour between measured closing speeds', () => {
        expect(missileLaunchRange('HiExpMissile', 300)).toBe(45_000);
        expect(missileLaunchRange('HiExpMissile', -300)).toBe(4_000);
    });

    it('is the no-escape range against a target opening at cruise speed', () => {
        expect(missileLaunchRange('HiExpMissile', -600)).toBe(4_000);
        expect(missileLaunchRange('ArmPenMissile', -600)).toBe(15_000);
        expect(missileLaunchRange('ElecMissile', -600)).toBe(15_000);
    });

    it('has no launch range against a target running at afterburner speed', () => {
        expect(missileLaunchRange('HiExpMissile', -1200)).toBe(0);
        expect(missileLaunchRange('ElecMissile', -2000)).toBe(0);
    });

    it('shortens in proportion to a slow crossing speed, so fix noise does not cut the still-target range', () => {
        expect(missileLaunchRange('HiExpMissile', 0, 30)).toBeCloseTo(43_250);
        expect(missileLaunchRange('HiExpMissile', 450, 30)).toBeCloseTo(43_250);
    });

    it('shortens against a target crossing the line of sight', () => {
        expect(missileLaunchRange('HiExpMissile', 0, 600)).toBe(10_000);
        expect(missileLaunchRange('ArmPenMissile', 0, 600)).toBe(30_000);
        expect(missileLaunchRange('HiExpMissile', 0, 1200)).toBe(0);
        expect(missileLaunchRange('ElecMissile', 0, 300)).toBe(55_000);
    });

    it('is shorter than the arming run for an unknown ammo', () => {
        expect(missileLaunchRange('None', 0)).toBeLessThan(MISSILE_MIN_LAUNCH_METERS);
    });

    it('reads closing and crossing speed off two fixes of the target relative to the own ship', () => {
        expect(rangeRate({ x: 10_000, y: 0 }, { x: 9_400, y: 0 }, 1)).toEqual({ closing: 600, crossing: 0 });
        const across = rangeRate({ x: 10_000, y: 0 }, { x: 10_000, y: 600 }, 2);
        expect(across.closing).toBeCloseTo(-18, 0);
        expect(across.crossing).toBeCloseTo(300, -1);
    });
});
