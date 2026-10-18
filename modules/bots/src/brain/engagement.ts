import { Contact, Radar, offNose } from './verbal';

/**
 * Missile launch band, shared by the reference weapons policy, the reference captain's orders and the
 * weapons KPI's firing solution: past the missile's arming run, inside what a HiExp missile reaches.
 * Missile range sweep (`npm --prefix modules/server run missile-range`, 2026-10-18, table in
 * `modules/ai/curriculum/lessons.md`): one HiExp missile hits a still dragonfly-MK1 from up to 45 km,
 * a crossing one from up to 4 km, and one running from launch at cruise speed from no range at all;
 * `max` is not yet set from it.
 */
export const MISSILE_LAUNCH_BAND_METERS = { min: 1000, max: 20_000 } as const;

/** How far inside the band's far edge the captain orders the ship: the target may drift outward while the missiles fly. */
const CLOSE_MARGIN_METERS = 2000;

/** The range the captain orders the ship to close to. */
export const CLOSE_RANGE_METERS = MISSILE_LAUNCH_BAND_METERS.max - CLOSE_MARGIN_METERS;

/**
 * The nearest ship the radar shows as another faction's. Only a contact scanned to BASIC or better
 * shows its faction, so an unidentified blip is never called an enemy.
 */
export function nearestEnemy(radar: Radar | undefined): Contact | undefined {
    const own = radar?.ownShip?.faction;
    return (radar?.contacts ?? [])
        .filter((c) => c.type === 'Spaceship' && c.faction !== undefined && c.faction !== own)
        .sort((a, b) => a.distance - b.distance)[0];
}

/** Where a contact lies off the nose, as said on the radio: `30° right of the nose`. */
export function offNoseWords(bearing: number, heading: number) {
    const off = Math.round(offNose(bearing, heading));
    return Math.abs(off) < 1 ? 'dead on the nose' : `${Math.abs(off)}° ${off > 0 ? 'right' : 'left'} of the nose`;
}

/** A world bearing as three digits, as a captain gives it: `045`. */
export function bearingWords(bearing: number) {
    return String(Math.round(((bearing % 360) + 360) % 360) % 360).padStart(3, '0');
}
