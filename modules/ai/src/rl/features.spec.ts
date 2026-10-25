import { Display, Heard } from '@starwards/bots';
import { FEATURE_NAMES, weaponsFeatures } from './features';
import { getStationsManifest } from '@starwards/server/src/stations-manifest';

const enemy = (id: string, x: number, y: number) => ({
    id,
    name: id,
    scanLevel: 'BASIC',
    type: 'Spaceship',
    faction: 2,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
    radius: 10,
});

function shown(): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile: 'HiExpShell', loadedProjectile: 'HiExpShell', loading: 0 }],
            'tubes-status': [
                { index: 0, projectile: 'HiExpMissile', loadedProjectile: 'HiExpMissile', loading: 0, bearing: 0 },
                { index: 1, projectile: 'ArmPenMissile', loadedProjectile: 'None', loading: 0.5, bearing: 180 },
            ],
            'targeting-status': { targetId: 'a', allyInLine: false, allyNearTarget: true },
            'ammo-status': {
                fitted: true,
                ammo: { HiExpShell: { count: 50, max: 100 }, ArmPenMissile: { count: 2, max: 8 } },
            },
            'systems-status': [],
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: [
                enemy('a', 1000, 0),
                enemy('b', 0, 3000),
                {
                    id: 's',
                    type: 'Station',
                    faction: 1,
                    position: { x: 0, y: 4000 },
                    distance: 4000,
                    bearing: 90,
                    radius: 100,
                    scanLevel: 'FULL',
                },
            ],
        },
    };
}

const heard: Heard[] = [{ speaker: 'captain', callout: 'engage', phrase: 'engage b', secondsAgo: 2 }];

/** Records every property path the features read, through proxies over the display and heard. */
function tracked<T extends object>(value: T, path: string, reads: Set<string>): T {
    return new Proxy(value, {
        get(target, key, receiver) {
            const v = Reflect.get(target, key, receiver) as unknown;
            if (typeof key === 'symbol') return v;
            const at = `${path}.${key}`;
            reads.add(at);
            return v && typeof v === 'object' ? tracked(v, at, reads) : v;
        },
    });
}

describe('weapons features', () => {
    it('is a fixed-length finite vector named feature by feature', () => {
        const f = weaponsFeatures(shown(), heard);
        expect(f.length).toBe(FEATURE_NAMES.length);
        expect(f.length).toBeGreaterThanOrEqual(40);
        expect(f.length).toBeLessThanOrEqual(60);
        expect([...f].every(Number.isFinite)).toBe(true);
        expect(weaponsFeatures({ panels: {} }, []).every(Number.isFinite)).toBe(true);
    });

    it('reads the lock, check fire and what the captain said', () => {
        const f = weaponsFeatures(shown(), heard);
        const at = (n: string) => f[FEATURE_NAMES.indexOf(n)];
        expect(at('lock.has')).toBe(1);
        expect(at('lock.distance')).toBeCloseTo(1000 / 10000);
        expect(at('checkFire.allyNearTarget')).toBe(1);
        expect(at('heard.captain.engage')).toBe(1);
        expect(at('ammo.ArmPenMissile')).toBeCloseTo(0.25);
    });

    it('leaks nothing: reads only the Weapons station panels, its radar and heard', () => {
        const reads = new Set<string>();
        weaponsFeatures(tracked(shown(), 'display', reads), tracked(heard, 'heard', reads));
        const weapons = getStationsManifest('ship').stations.weapons.widgets!;
        const panels = [...reads].filter((r) => r.startsWith('display.panels.')).map((r) => r.split('.')[2]);
        expect(panels.length).toBeGreaterThan(0);
        for (const p of panels) expect(weapons).toContain(p);
        for (const r of reads) expect(r).toMatch(/^(display\.(panels|radar)|heard)(\.|$)/);
        // the helms radar and armour are not on the weapons console: injecting them changes nothing
        const extra = shown();
        extra.panels['armor-status'] = { numberOfPlates: 10, healthyPlates: 1 };
        extra.panels['helms-stats'] = { targetLocked: true };
        expect(weaponsFeatures(extra, heard)).toEqual(weaponsFeatures(shown(), heard));
    });
});
