import { Contact, Radar } from './verbal';
import { alliedStations } from './callout';
import { isEnemyShip } from './enemy';
import { referenceKnobs } from './reference-knobs';

const apart = (a: Contact, b: Contact) => Math.hypot(a.position!.x - b.position!.x, a.position!.y - b.position!.y);

/**
 * The enemy the gun should work on under `GUN_TARGET_MODE`, or undefined where the mode (0) or the
 * picture (no enemy meets its rule) leaves the choice to the current play. `held` is the enemy
 * picked before (the lock or the remembered pick): it is kept while it still qualifies, so the lock does not thrash.
 */
export function gunPick(radar: Radar | undefined, held?: Contact): Contact | undefined {
    const mode = referenceKnobs.GUN_TARGET_MODE;
    if (mode < 0.5) return undefined;
    const own = radar?.ownShip?.faction;
    const enemies = (radar?.contacts ?? []).filter((c) => isEnemyShip(c, own) && c.position);
    const stations = alliedStations(radar).filter((s) => s.position);
    const heldNow = held && enemies.find((e) => e.id === held.id);
    if (mode < 1.5) {
        const near = (e: Contact) => stations.some((s) => apart(e, s) <= referenceKnobs.GUN_STATION_CLEAR_METERS);
        const inside = enemies.filter(near);
        return heldNow && near(heldNow) ? heldNow : inside.sort((a, b) => a.distance - b.distance)[0];
    }
    const on = (s: Contact) => enemies.filter((e) => apart(e, s) <= referenceKnobs.ATTACK_METERS);
    const closest = (s: Contact) => Math.min(...on(s).map((e) => apart(e, s)));
    const station = stations
        .filter((s) => on(s).length > 0)
        .sort((a, b) => on(b).length - on(a).length || closest(a) - closest(b))[0];
    if (!station) return undefined;
    const best = on(station).sort((a, b) => apart(a, station) - apart(b, station))[0];
    const keep =
        heldNow &&
        apart(heldNow, station) <= referenceKnobs.ATTACK_METERS &&
        apart(heldNow, station) - referenceKnobs.RETARGET_MARGIN_METERS <= apart(best, station);
    return keep ? heldNow : best;
}
