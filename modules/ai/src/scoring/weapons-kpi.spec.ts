import {
    ShipReading,
    TacticalFrame,
    ammoShortfall,
    ammoValue,
    shellReaches,
    tacticalSeries,
    tacticalWindows,
    weaponsScore,
} from './weapons-kpi';

import { RecordingEventLine } from '@starwards/core/internal';
import { compositeArmor } from '@starwards/core/src/configurations/armor-models';

const types = ['HiExp', 'ArmPen', 'Frag', 'Tandem', 'Elec'] as const;
const fighter = (over: Partial<ShipReading> = {}): ShipReading => ({
    id: 'enemy',
    faction: 1,
    x: 3000,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 11,
    destroyed: false,
    incapacitation: 0,
    threat: 1,
    plateHealth: 400,
    plateHealthMax: 400,
    plateDamage: Object.fromEntries(types.map((t) => [t, compositeArmor[`plateDamage_${t}`]])) as never,
    penetration: Object.fromEntries(types.map((t) => [t, compositeArmor[`penetration_${t}`]])) as never,
    capsuleDamage50: 40,
    internals: 4,
    kill: 0,
    cap: 1,
    // a dragonfly's one gun (damage50 20) and four thrusters (damage50 15), by the defect rules
    surfaceExposure: 0.05 / 40 + (4 * ((0.0275 / 4) * 0.5)) / 30,
    ...over,
});

/** A frame at `t`: us at the origin, nose (and gun) on the enemy, holding it as the target. */
const frame = (t: number, enemy: Partial<ShipReading> = {}, gunBearing = 0): TacticalFrame => ({
    t,
    own: { ...fighter({ id: 'us', faction: 0, x: 0 }) },
    enemies: [fighter(enemy)],
    friends: [],
    weapons: {
        gun: 1,
        gunBearing,
        bulletSpeed: 2000,
        spreadDegrees: 1,
        fuzeSeconds: 1.5,
        gunAmmo: 'HiExpShell',
        shellsInMagazine: ['HiExpShell', 'ArmPenShell', 'FragShell'],
        targetId: 'enemy',
        tubesReady: false,
    },
});

const shot = (t: number, vy = 0): RecordingEventLine => ({
    t,
    kind: 'shot',
    objectId: `shell-${t}`,
    data: { shipId: 'us', ammo: 'HiExpShell', targetId: 'enemy', x: 0, y: 0, vx: 2000, vy, ttl: 1.5 },
});
const hit = (t: number, shooterId: string): RecordingEventLine => ({
    t,
    kind: 'damage',
    objectId: 'enemy',
    data: { shooterId, plateLoss: 20, defects: 0 },
});

describe('weapons and tactical scores', () => {
    it('a shell aimed at the target reaches it; one fired wide or away does not', () => {
        const target = { x: 3000, y: 0, vx: 0, vy: 0, radius: 11 };
        expect(shellReaches({ x: 0, y: 0, vx: 2000, vy: 0 }, 1.5, 'HiExpShell', target)).toBe(true);
        expect(shellReaches({ x: 0, y: 0, vx: 2000, vy: 600 }, 1.5, 'HiExpShell', target)).toBe(false);
        expect(shellReaches({ x: 0, y: 0, vx: -2000, vy: 0 }, 1.5, 'HiExpShell', target)).toBe(false);
    });

    it('on intact composite armor Frag shells give up most of the best round; HiExp and ArmPen little', () => {
        const all = ['HiExpShell', 'ArmPenShell', 'FragShell'] as const;
        expect(ammoShortfall('FragShell', all, fighter())).toBeGreaterThan(0.5);
        expect(ammoShortfall('HiExpShell', all, fighter())).toBeLessThan(0.5);
        expect(ammoShortfall('ArmPenShell', all, fighter())).toBeLessThan(0.5);
        // with nothing better loaded, a round gives up nothing
        expect(ammoShortfall('FragShell', ['FragShell'], fighter())).toBe(0);
        expect(ammoValue('FragShell', fighter())).toBeGreaterThan(0);
    });

    it('charges rounds fired without a solution, and rewards holding the lock', () => {
        const frames = [frame(0), frame(1), frame(2)];
        const aimed = weaponsScore(frames, [shot(0.5), shot(1.5)], 'us');
        const sprayed = weaponsScore(frames, [shot(0.5), shot(1.5, 900)], 'us');
        expect(aimed.nosol).toBe(0);
        expect(sprayed.nosol).toBe(0.5);
        expect(sprayed.kw!).toBeLessThan(aimed.kw!);
        expect(aimed.lockUptime).toBe(1);
        expect(aimed.lockThreat).toBe(1);
    });

    it('a crew that fires no round has no weapons score, not a perfect one', () => {
        expect(weaponsScore([frame(0), frame(1)], [], 'us').kw).toBeNull();
    });

    it('credits only incapacitation our own hits dealt, and a crew that never fires converts nothing', () => {
        const frames = Array.from({ length: 46 }, (_, t) => frame(t, { incapacitation: t / 100 }));
        const ours = tacticalWindows(
            frames,
            frames.map((f) => hit(f.t + 0.5, 'us')),
            'us',
        );
        const theirs = tacticalWindows(
            frames,
            frames.map((f) => hit(f.t + 0.5, 'other')),
            'us',
        );
        expect(ours).toHaveLength(1);
        expect(ours[0].T).toBeGreaterThan(0);
        expect(ours[0].O).toBeCloseTo(1, 6);
        expect(theirs[0].T).toBe(0);
        const offAim = Array.from({ length: 46 }, (_, t) => frame(t, {}, 90));
        expect(tacticalWindows(offAim, [], 'us')[0].O).toBe(0);
    });

    it("opportunity is helms' geometry alone: rounds fired add none, and conversion never exceeds it", () => {
        // nose off the target at every frame, one aimed round at t = 10.5 and our hits all along
        const frames = Array.from({ length: 46 }, (_, t) => frame(t, { incapacitation: t / 100 }, 90));
        const [w] = tacticalWindows(frames, [shot(10.5), ...frames.map((f) => hit(f.t + 0.5, 'us'))], 'us');
        expect(w.O).toBe(0);
        expect(w.T).toBe(0);
        expect(w.clipped).toBe(true);
    });

    it('slides one window per frame, the first equal to the consecutive windows', () => {
        const frames = Array.from({ length: 60 }, (_, t) => frame(t, { incapacitation: t / 200 }));
        const events = frames.map((f) => hit(f.t + 0.5, 'us'));
        const series = tacticalSeries(frames, events, 'us');
        expect(series[0]).toEqual(tacticalWindows(frames, events, 'us')[0]);
        expect(series[10]?.t).toBe(10);
        // fewer than half a window left
        expect(series[40]).toBeUndefined();
    });
});
