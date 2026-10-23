import { Faction, ScanLevel, SpaceObject, Spaceship } from '../space';
import { ShipIntelSource, designIntelSource, objectDisplayName, playerScanLevel } from './space-object-intel';

import { ShipState } from '../ship';

/**
 * The capsule tiers, best first: a tier holds while integrity is above `above`. The single edit
 * point for tier names and thresholds (SPEC-0010 Q1). The capsule is never shown as a number.
 */
export const CAPSULE_TIERS = [
    { tier: 'intact', above: 0.75 },
    { tier: 'damaged', above: 0.4 },
    { tier: 'critical', above: 0.15 },
    { tier: 'failing', above: -Infinity },
] as const;

export type CapsuleTier = (typeof CAPSULE_TIERS)[number]['tier'];

/** Hysteresis and callout pacing of hull status (SPEC-0010 Q3). */
export const HULL_STATUS_TUNING = {
    /** Seconds a new tier must hold before it is settled. */
    dwellSeconds: 2,
    /** Integrity a return to a better tier must clear past its threshold. */
    returnMargin: 0.05,
    /** At most one hull-status callout per this many seconds. */
    calloutWindowSeconds: 5,
};

function tierIndex(integrity: number) {
    return CAPSULE_TIERS.findIndex((t) => integrity > t.above);
}

/** The capsule tier of an integrity (0..1), without hysteresis. */
export function capsuleTier(integrity: number): CapsuleTier {
    return CAPSULE_TIERS[tierIndex(integrity)].tier;
}

/**
 * Settles each subject's capsule tier with hysteresis, so a value oscillating at a threshold does
 * not flip the tier: a new tier must hold `dwellSeconds`, and a return to a better tier must clear
 * its threshold by `returnMargin`. One tracker per observer (a station screen, a bot session).
 */
export class CapsuleTierTracker {
    private readonly subjects = new Map<string, { settled: number; candidate?: number; since: number }>();

    /** The settled tier of `id` given its integrity now; `now` in seconds. */
    settle(id: string, integrity: number, now: number): CapsuleTier {
        const raw = tierIndex(integrity);
        const s = this.subjects.get(id);
        if (!s) {
            this.subjects.set(id, { settled: raw, since: now });
            return CAPSULE_TIERS[raw].tier;
        }
        const proposed =
            raw < s.settled && integrity <= CAPSULE_TIERS[raw].above + HULL_STATUS_TUNING.returnMargin ? raw + 1 : raw;
        if (proposed === s.settled) {
            s.candidate = undefined;
        } else if (s.candidate !== proposed) {
            s.candidate = proposed;
            s.since = now;
        }
        if (s.candidate !== undefined && now - s.since >= HULL_STATUS_TUNING.dwellSeconds) {
            s.settled = s.candidate;
            s.candidate = undefined;
        }
        return CAPSULE_TIERS[s.settled].tier;
    }

    /** Forgets every subject not in `ids`. */
    retain(ids: ReadonlySet<string>) {
        for (const id of this.subjects.keys()) {
            if (!ids.has(id)) this.subjects.delete(id);
        }
    }
}

/**
 * One row of the Signals hull-status list.
 * - `LIVE`: allied telemetry, or a FULL scan; values are current.
 * - `SNAPSHOT`: values frozen `ageSeconds` ago.
 * - `PENDING`: the source has not delivered the subject's state yet; no values.
 */
export type HullStatus = {
    id: string;
    name: string;
    /** same faction as the observer: telemetry, always live */
    allied: boolean;
    intel: 'LIVE' | 'SNAPSHOT' | 'PENDING';
    ageSeconds?: number;
    /** 0..100, the ship's `healthRatio` (how far it is from a mission kill) */
    hullPercent?: number;
    capsule?: CapsuleTier;
};

function isAlly(o: SpaceObject, playerFaction: Faction | undefined) {
    return playerFaction !== undefined && playerFaction !== Faction.NONE && o.faction === playerFaction;
}

/**
 * Where a subject's hull status comes from: allies always live (telemetry), a GM sees all live,
 * others by scan level (`designIntelSource`: FULL live, SNAPSHOT frozen, below that not listed).
 */
function hullSource(o: SpaceObject, playerFaction: Faction | undefined) {
    return isAlly(o, playerFaction) ? 'live' : designIntelSource(playerScanLevel(o, playerFaction));
}

function values(state: ShipState) {
    return { hullPercent: Math.round(state.healthRatio * 100), integrity: state.capsule.integrity };
}

/**
 * The Signals hull-status list for an observer of `playerFaction`: every allied ship and station,
 * and every other ship scanned to SNAPSHOT or FULL, allies first. Membership keys on faction and
 * scan level only, so no row discloses a contact below SNAPSHOT. Live capsule tiers are settled by
 * `tracker` (hysteresis); a snapshot's tier is its frozen value. `now` in seconds.
 */
export function hullStatusList(
    objects: Iterable<SpaceObject>,
    playerFaction: Faction | undefined,
    selfId: string,
    source: ShipIntelSource,
    tracker: CapsuleTierTracker,
    now: number,
): HullStatus[] {
    const rows: HullStatus[] = [];
    const tracked = new Set<string>();
    for (const o of objects) {
        const from = o.id !== selfId && Spaceship.isInstance(o) ? hullSource(o, playerFaction) : undefined;
        if (!from || !Spaceship.isInstance(o) || o.destroyed) continue;
        const allied = isAlly(o, playerFaction);
        const row: HullStatus = {
            id: o.id,
            name: objectDisplayName(o, o.id, ScanLevel.BASIC),
            allied,
            intel: 'PENDING',
        };
        if (from === 'live') {
            const state = source.live(o);
            if (state) {
                const { hullPercent, integrity } = values(state);
                tracked.add(o.id);
                Object.assign(row, { intel: 'LIVE', hullPercent, capsule: tracker.settle(o.id, integrity, now) });
            }
        } else {
            const snapshot = playerFaction === undefined ? undefined : source.snapshot(o, playerFaction);
            if (snapshot) {
                const { hullPercent, integrity } = values(snapshot.state);
                Object.assign(row, {
                    intel: 'SNAPSHOT',
                    ageSeconds: snapshot.ageSeconds,
                    hullPercent,
                    capsule: capsuleTier(integrity),
                });
            }
        }
        rows.push(row);
    }
    tracker.retain(tracked);
    return rows.sort((a, b) => Number(b.allied) - Number(a.allied));
}
