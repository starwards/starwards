import { referenceKnobs } from './reference-knobs';
import { Contact, Radar, offNose } from './verbal';
import { MISSILE_MIN_LAUNCH_METERS, missileLaunchRange, rangeRate } from './missile-envelope';

import { Display } from './controls';

/** The missile the reference loads: its envelope sets where the reference captain sends the ship. */
const REFERENCE_MISSILE = 'HiExpMissile';

/** How far inside the launch range the captain orders the ship: the target may drift outward while the missiles fly. */

/**
 * How fast `contact` flies along the line of sight toward the own ship and across it, from where the
 * radar showed it a decision (`seconds`) ago: the target's own motion, not the own ship's, which the
 * missile does not inherit. A target seen once counts as holding still.
 */
function contactRates(contact: Contact, radar: Radar | undefined, previous: Radar | undefined, seconds: number) {
    const before = previous?.contacts?.find((c) => c.id === contact.id);
    const own = radar?.ownShip?.position;
    if (!before?.position || !contact.position || !own) {
        return { closing: 0, crossing: 0 };
    }
    return rangeRate(
        { x: before.position.x - own.x, y: before.position.y - own.y },
        { x: contact.position.x - own.x, y: contact.position.y - own.y },
        seconds,
    );
}

/** The farthest range to launch `ammo` (the reference's missile by default) at `contact` as it moves now. */
export function launchRange(
    contact: Contact,
    radar: Radar | undefined,
    previous: Radar | undefined,
    seconds: number,
    ammo = REFERENCE_MISSILE,
) {
    const { closing, crossing } = contactRates(contact, radar, previous, seconds);
    return missileLaunchRange(ammo, closing, crossing);
}

/** Whether a missile launched now at `distance` arms and hits, given the envelope's `range`. */
export function inLaunchEnvelope(distance: number, range: number) {
    return distance >= MISSILE_MIN_LAUNCH_METERS && distance <= range;
}

/**
 * Where the captain sends the ship once the enemy is inside the launch envelope: in to gun range, so
 * the ship arrives while the missiles fly (mined from the Jev captain on T3-directed, 2026-10-18).
 */
export const GUN_CLOSE_METERS = 2000;

/**
 * The range the captain orders the ship to close to, `distance` from an enemy whose launch envelope
 * reaches `range`: inside the envelope while beyond it, to gun range once inside it.
 */
export function closeRange(distance: number, range: number) {
    return inLaunchEnvelope(distance, range)
        ? GUN_CLOSE_METERS
        : Math.max(MISSILE_MIN_LAUNCH_METERS, range - referenceKnobs.CLOSE_MARGIN_METERS);
}

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

/** The contact the weapons lock holds, as the seat's radar shows it; undefined without a lock or while the radar does not show it. */
export function lockedContact(display: Display): Contact | undefined {
    const targetId = (display.panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
    return targetId ? (display.radar as Radar | undefined)?.contacts?.find((c) => c.id === targetId) : undefined;
}

/**
 * The missiles left in the magazine of the kinds the tubes load (as the tubes panel shows them), from
 * the ammo panel; every missile kind when no tube shows one; undefined without the ammo panel.
 */
export function missilesInMagazine(display: Display): number | undefined {
    const ammo = (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo;
    const tubes = (display.panels['tubes-status'] ?? []) as { loadedProjectile?: string; projectile?: string }[];
    const loaded = new Set(
        tubes.flatMap((t) => [t.loadedProjectile, t.projectile]).filter((k) => k?.endsWith('Missile')),
    );
    return ammo
        ? Object.entries(ammo)
              .filter(([kind]) => kind.endsWith('Missile') && (!loaded.size || loaded.has(kind)))
              .reduce((sum, [, stock]) => sum + (stock.count ?? 0), 0)
        : undefined;
}

/** The chain-gun shells in the magazine and the capacity they fit, from the ammo panel; undefined without the panel. */
export function shellStock(display: Display): { count: number; max: number } | undefined {
    const ammo = (
        display.panels['ammo-status'] as { ammo?: Record<string, { count?: number; max?: number }> } | undefined
    )?.ammo;
    const shells = Object.entries(ammo ?? {}).filter(([kind]) => kind.endsWith('Shell'));
    return shells.length
        ? {
              count: shells.reduce((sum, [, stock]) => sum + (stock.count ?? 0), 0),
              max: shells.reduce((sum, [, stock]) => sum + (stock.max ?? 0), 0),
          }
        : undefined;
}

/**
 * How fast `contact` closes on the own ship along the line of sight (negative: opening), from where
 * the radar showed it a decision (`seconds`) ago.
 */
export function closingSpeed(contact: Contact, radar: Radar | undefined, previous: Radar | undefined, seconds: number) {
    return contactRates(contact, radar, previous, seconds).closing;
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
