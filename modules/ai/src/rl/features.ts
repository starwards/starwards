import { Display, Heard } from '@starwards/bots';

/**
 * The residual weapons policy's observation: a fixed-length vector read only from the Weapons console
 * (`observeStation` panels and its tactical radar) and what the seat heard, so it is fog-of-war by construction.
 */

type Contact = {
    id: string;
    distance: number;
    bearing: number;
    position: { x: number; y: number };
    type?: string;
    faction?: number;
    radius?: number;
    scanLevel?: string;
};
type Radar = { ownShip?: { heading?: number; faction?: number }; contacts?: Contact[] };
type Tube = { index: number; projectile: string; loadedProjectile: string; loading: number; bearing?: number };
type Gun = { index: number; projectile: string; loadedProjectile: string; loading: number };

const RANGE = 10_000;
const ENEMIES = 3;
const TUBES = 2;
const SHELLS = ['HiExpShell', 'ArmPenShell', 'FragShell'];
/** The callouts weapons listens for (`hears` in its brain), each a flag while heard within `HEARD_SECONDS`. */
const HEARS = ['captain.engage', 'captain.check_fire', 'engineer.gun_skewed', 'signals.scanned'];
const HEARD_SECONDS = 10;
const AMMO = ['HiExpShell', 'ArmPenShell', 'HiExpMissile', 'ArmPenMissile'];

export const FEATURE_NAMES: readonly string[] = [
    'lock.has',
    'lock.distance',
    'lock.offNoseSin',
    'lock.offNoseCos',
    'lock.isShip',
    'lock.isAlly',
    'lock.unscanned',
    'lock.isNearest',
    'checkFire.allyInLine',
    'checkFire.allyNearTarget',
    ...Array.from({ length: ENEMIES }, (_, i) =>
        ['present', 'distance', 'offNoseSin', 'offNoseCos', 'stationGap', 'locked'].map((f) => `enemy${i}.${f}`),
    ).flat(),
    'enemies.count',
    'unscanned.count',
    'station.present',
    'station.distance',
    'station.nearestEnemyGap',
    ...SHELLS.map((s) => `gun.${s}`),
    'gun.loaded',
    'gun.loading',
    ...AMMO.map((a) => `ammo.${a}`),
    ...Array.from({ length: TUBES }, (_, i) =>
        ['present', 'loaded', 'loadedHE', 'loadedAP', 'loading', 'typedAP', 'bearingOffLock'].map(
            (f) => `tube${i}.${f}`,
        ),
    ).flat(),
    ...HEARS.map((h) => `heard.${h}`),
];

const isShip = (c: Contact) => c.type === 'Spaceship' || (c.type === undefined && (c.radius ?? 0) >= 5);
const delta = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;
const rad = (deg: number) => (deg * Math.PI) / 180;
const clip = (x: number) => Math.max(0, Math.min(1, x));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function weaponsFeatures(display: Display, heard: readonly Heard[]): number[] {
    const radar = (display.radar ?? {}) as Radar;
    const panels = display.panels;
    const heading = radar.ownShip?.heading ?? 0;
    const own = radar.ownShip?.faction;
    const contacts = radar.contacts ?? [];
    const ally = (c: Contact) => own !== undefined && c.faction === own;
    const targeting = (panels['targeting-status'] ?? {}) as {
        targetId?: string | null;
        allyInLine?: unknown;
        allyNearTarget?: unknown;
    };
    const lock = contacts.find((c) => c.id === targeting.targetId);
    const enemies = contacts.filter((c) => isShip(c) && !ally(c)).sort((a, b) => a.distance - b.distance);
    const stations = contacts.filter((c) => c.type === 'Station' && ally(c)).sort((a, b) => a.distance - b.distance);
    const stationGap = (c: Contact) =>
        stations.length ? clip(Math.min(...stations.map((s) => dist(s.position, c.position))) / RANGE) : 1;
    const offNose = (c: Contact) => rad(delta(c.bearing, heading));
    const f: number[] = [
        targeting.targetId ? 1 : 0,
        lock ? clip(lock.distance / RANGE) : 1,
        lock ? Math.sin(offNose(lock)) : 0,
        lock ? Math.cos(offNose(lock)) : 0,
        lock && isShip(lock) ? 1 : 0,
        lock && ally(lock) ? 1 : 0,
        lock?.scanLevel === 'UFO' ? 1 : 0,
        lock && enemies[0]?.id === lock.id ? 1 : 0,
        targeting.allyInLine ? 1 : 0,
        targeting.allyNearTarget ? 1 : 0,
    ];
    for (let i = 0; i < ENEMIES; i++) {
        const e = enemies[i];
        f.push(
            e ? 1 : 0,
            e ? clip(e.distance / RANGE) : 1,
            e ? Math.sin(offNose(e)) : 0,
            e ? Math.cos(offNose(e)) : 0,
            e ? stationGap(e) : 1,
            e && e.id === targeting.targetId ? 1 : 0,
        );
    }
    const nearestStation = stations[0];
    f.push(
        clip(enemies.length / 10),
        clip(contacts.filter((c) => c.scanLevel === 'UFO').length / 20),
        nearestStation ? 1 : 0,
        nearestStation ? clip(nearestStation.distance / RANGE) : 1,
        enemies.length ? Math.min(...enemies.map(stationGap)) : 1,
    );
    const gun = ((panels['gun-status'] ?? []) as Gun[])[0];
    f.push(
        ...SHELLS.map((s) => (gun?.projectile === s ? 1 : 0)),
        gun && gun.loadedProjectile !== 'None' ? 1 : 0,
        clip(gun?.loading ?? 0),
    );
    const ammo =
        (panels['ammo-status'] as { ammo?: Record<string, { count?: number; max?: number }> } | undefined)?.ammo ?? {};
    f.push(...AMMO.map((a) => clip((ammo[a]?.count ?? 0) / Math.max(1, ammo[a]?.max ?? 1))));
    const tubes = (panels['tubes-status'] ?? []) as Tube[];
    for (let i = 0; i < TUBES; i++) {
        const t = tubes[i];
        const loaded = t && t.loadedProjectile !== 'None';
        f.push(
            t ? 1 : 0,
            loaded ? 1 : 0,
            t?.loadedProjectile === 'HiExpMissile' ? 1 : 0,
            t?.loadedProjectile === 'ArmPenMissile' ? 1 : 0,
            clip(t?.loading ?? 0),
            t?.projectile === 'ArmPenMissile' ? 1 : 0,
            t && lock ? Math.abs(delta(lock.bearing, heading + (t.bearing ?? 0))) / 180 : 1,
        );
    }
    const recent = new Set(
        heard
            .filter((h) => h.callout !== undefined && h.secondsAgo <= HEARD_SECONDS)
            .map((h) => `${h.speaker}.${h.callout}`),
    );
    f.push(...HEARS.map((h) => (recent.has(h) ? 1 : 0)));
    return f;
}
