import { Explosion } from './explosion';
import { Nebula } from './nebula';

/**
 * Objects that must never surface as a radar contact, blip, or scan job — only as a
 * field-of-view obstruction. `FieldOfView` stays unfiltered so these still cast a shadow;
 * every consumer that turns a field of view into a player-facing contact list (radar
 * rendering, MCP `get_radar_contacts`, signals scan-job creation, weapons targeting) filters
 * through this. A transient blast and a passive optical hazard share the same rule for
 * different reasons — an explosion because it is gone before anyone could scan it, a nebula
 * because it is never something a crew scans or locks onto in the first place.
 */
export function isSensorInvisible(object: unknown): boolean {
    return Explosion.isInstance(object) || Nebula.isInstance(object);
}
