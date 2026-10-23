import { Faction, ScanLevel, SpaceObject, Spaceship } from '../space';
import { ShipIntelSource, designIntelSource, objectDisplayName, playerScanLevel } from './space-object-intel';

import { ShipState } from '../ship';

/**
 * The status tiers of both hull and capsule, best first: a tier holds while the 0..1 value is above
 * `above`. The single edit point for tier names and thresholds (SPEC-0010 Q1). Neither hull nor
 * capsule is ever shown as a number.
 */
export const STATUS_TIERS = [
    { tier: 'intact', above: 0.9 },
    { tier: 'damaged', above: 0.4 },
    { tier: 'critical', above: 0.15 },
    { tier: 'failing', above: -Infinity },
] as const;

export type StatusTier = (typeof STATUS_TIERS)[number]['tier'];

/** Hysteresis and callout pacing of hull status (SPEC-0010 Q3). */
export const HULL_STATUS_TUNING = {
    /** Seconds a new tier must hold before it is settled. */
    dwellSeconds: 2,
    /** Integrity a return to a better tier must clear past its threshold. */
    returnMargin: 0.05,
    /** At most one hull-status callout per this many seconds. */
    calloutWindowSeconds: 5,
};

function tierIndex(value: number) {
    return STATUS_TIERS.findIndex((t) => value > t.above);
}

/** The status tier of a 0..1 value, without hysteresis. */
export function statusTier(value: number): StatusTier {
    return STATUS_TIERS[tierIndex(value)].tier;
}

/**
 * Settles each subject's status tier (keyed per subject and part) with hysteresis, so a value oscillating at a threshold does
 * not flip the tier: a new tier must hold `dwellSeconds`, and a return to a better tier must clear
 * its threshold by `returnMargin`. One tracker per observer (a station screen, a bot session).
 */
export class StatusTierTracker {
    private readonly subjects = new Map<string, { settled: number; candidate?: number; since: number }>();

    /** The settled tier of `id` given its 0..1 value now; `now` in seconds. */
    settle(id: string, value: number, now: number): StatusTier {
        const raw = tierIndex(value);
        const s = this.subjects.get(id);
        if (!s) {
            this.subjects.set(id, { settled: raw, since: now });
            return STATUS_TIERS[raw].tier;
        }
        const proposed =
            raw < s.settled && value <= STATUS_TIERS[raw].above + HULL_STATUS_TUNING.returnMargin ? raw + 1 : raw;
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
        return STATUS_TIERS[s.settled].tier;
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
    /** tier of the ship's `healthRatio` (how far it is from a mission kill) */
    hull?: StatusTier;
    /** tier of the capsule's integrity (how far it is from death) */
    capsule?: StatusTier;
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
    return { hull: state.healthRatio, capsule: state.capsule.integrity };
}

/**
 * The Signals hull-status list for an observer of `playerFaction`: every allied ship and station,
 * and every other ship scanned to SNAPSHOT or FULL, allies first. Membership keys on faction and
 * scan level only, so no row discloses a contact below SNAPSHOT. Live tiers are settled by
 * `tracker` (hysteresis); a snapshot's tiers are its frozen values. `now` in seconds.
 */
export function hullStatusList(
    objects: Iterable<SpaceObject>,
    playerFaction: Faction | undefined,
    selfId: string,
    source: ShipIntelSource,
    tracker: StatusTierTracker,
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
                const { hull, capsule } = values(state);
                tracked.add(`${o.id}:hull`).add(`${o.id}:capsule`);
                Object.assign(row, {
                    intel: 'LIVE',
                    hull: tracker.settle(`${o.id}:hull`, hull, now),
                    capsule: tracker.settle(`${o.id}:capsule`, capsule, now),
                });
            }
        } else {
            const snapshot = playerFaction === undefined ? undefined : source.snapshot(o, playerFaction);
            if (snapshot) {
                const { hull, capsule } = values(snapshot.state);
                Object.assign(row, {
                    intel: 'SNAPSHOT',
                    ageSeconds: snapshot.ageSeconds,
                    hull: statusTier(hull),
                    capsule: statusTier(capsule),
                });
            }
        }
        rows.push(row);
    }
    tracker.retain(tracked);
    return rows.sort((a, b) => Number(b.allied) - Number(a.allied));
}
