import { referenceKnobs } from './reference-knobs';
import {
    CALLOUT_QUESTION,
    Heard,
    SILENCE,
    alliedStations,
    checkFireOf,
    magazineCapacity,
    stationThreat,
    stationsCentre,
} from './callout';
import { Contact, Radar } from './verbal';
import { inLaunchEnvelope, launchRange, lockedContact, nearestEnemy, shellStock } from './engagement';

import { Answer } from './brain';
import { BrainRequest } from './request';
import { Display } from './controls';

/** What the seat counts itself: the missiles it launched under the current engagement, and how many still fly. */
export type SalvoTally = { n: number; inFlight: number };

/** What a callout rule reads: the display now and a decision (`seconds`) ago, and what the seat heard and remembers. */
type Picture = {
    display: Display;
    radar: Radar | undefined;
    previousDisplay: Display | undefined;
    previous: Radar | undefined;
    seconds: number;
    /** The ship the captain last ordered engaged. */
    engaged: string | undefined;
    heard: readonly Heard[];
    /** Per-seat memory across decisions. */
    memory: Map<string, unknown>;
    /** The seat's own clock, seconds. */
    now: number;
    /** Weapons: a missile leaves a tube at this decision, and the tally including it. */
    salvo?: SalvoTally;
    /** Captain: the board holds a salvo order. */
    salvoOrdered: boolean;
    /** Captain: the board holds a focus order. */
    focusOrdered: boolean;
    /** Captain: the station the standing focus picks the enemy nearest to. */
    focusStation: string | undefined;
    /** Captain: the board holds a check fire order. */
    checkFireOrdered: boolean;
    /** Captain: the board holds a dock order, under way or done. */
    dockOrdered: boolean;
};

/** Seconds the captain keeps its last order after signals reports the enemy lost: a contact drops for a few seconds when the relaying station is hit. */
/** Seconds between two weapons reports that the locked ship is still beyond the envelope. */
const OUT_OF_ENVELOPE_REPEAT_SECONDS = 10;
/** Seconds between two weapons check-fire calls while an ally stays at risk. */
const CHECK_FIRE_REPEAT_SECONDS = 10;
/** A wreck this near where the lost ship was last seen says the ship was destroyed, not lost. */
const WRECK_METERS = 1000;
const SHIP_RADIUS_METERS = 5;
/** A contact this wide is a station a ship docks at. */
const STATION_RADIUS_METERS = 200;
/** The captain moves a standing focus to another station only once that station's nearest enemy is this much nearer than the focus station's. */
/** Nor while an enemy is still this near the focus station: its attackers come first. */
/** Seconds an enemy last seen near the focus station keeps the focus: far contacts drop off the radar for a decision or two. */

/** Weapons calls the shells low below this share of the magazine, and restocked once they are back above `SHELLS_RESTOCKED`. */
const SHELLS_RESTOCKED = 0.8;
/** The captain docks to restock only with no enemy within this range, and casts off when one comes inside it. */
const DOCK_CLEAR_METERS = 100_000;
/** Nor with the nearest allied station farther than this: the ship would be docking while the stations fall. */
const DOCK_NEAR_METERS = 45_000;

/**
 * How a brain restocks, when it differs from the reference: `byCapacity` measures the shells against what the
 * magazine holds now rather than the most it ever held (a restock fills only to that), and `dockClearMeters`
 * is the range within which an enemy keeps the captain from docking and sends it off a dock; `lowShare` and
 * `restockedShare` replace the shares of the stock under which the shells are called low and over which restocked.
 */
export type Resupply = { byCapacity?: boolean; dockClearMeters?: number; lowShare?: number; restockedShare?: number };

const resupplyOf = (p: Picture) => (p.memory.get('resupply') as Resupply | undefined) ?? {};

/** A guarding captain sends the ship to the stations' centre only while it is farther off it than this. */

/** An enemy this near an allied station closes on it. */
/** The captain moves its target to another enemy of the same station only once that one is this much nearer the station. */

type ThreatPick = { station: Contact; enemy: Contact };

const apart = (a: Contact, b: Contact) =>
    a.position && b.position ? Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) : Infinity;

/**
 * Captain with `threatTarget`: the station the most enemies are within `referenceKnobs.ATTACK_METERS` of, and the enemy
 * nearest it. The remembered station holds until another has strictly more enemies on it, or none is left
 * on it; the remembered enemy holds until another is `referenceKnobs.RETARGET_MARGIN_METERS` nearer the station. With no
 * enemy on any station, undefined. Picked once per decision.
 */
function threatPick(p: Picture): ThreatPick | undefined {
    if (p.memory.get('threatPickAt') === p.now) return p.memory.get('threatPick') as ThreatPick | undefined;
    const contacts = p.radar?.contacts ?? [];
    const enemies = contacts.filter((c) => isEnemyShip(c, p.radar) && c.position);
    const stations = contacts.filter(
        (c) =>
            c.type === 'Spaceship' &&
            c.faction === p.radar?.ownShip?.faction &&
            (c.radius ?? 0) >= STATION_RADIUS_METERS &&
            c.position,
    );
    const on = (s: Contact) => enemies.filter((e) => apart(e, s) <= referenceKnobs.ATTACK_METERS);
    const nearest = (s: Contact) => Math.min(...on(s).map((e) => apart(e, s)));
    const ranked = stations
        .filter((s) => on(s).length > 0)
        .sort((a, b) => on(b).length - on(a).length || nearest(a) - nearest(b));
    const before = p.memory.get('threatPick') as ThreatPick | undefined;
    const kept = before && ranked.find((s) => s.name === before.station.name);
    const station = kept && on(kept).length >= on(ranked[0]).length ? kept : ranked[0];
    let pick: ThreatPick | undefined;
    if (station) {
        const best = on(station).sort((a, b) => apart(a, station) - apart(b, station))[0];
        const held = before?.station.name === station.name && on(station).find((e) => e.name === before.enemy.name);
        pick = {
            station,
            enemy:
                held && apart(held, station) - referenceKnobs.RETARGET_MARGIN_METERS <= apart(best, station)
                    ? held
                    : best,
        };
    }
    p.memory.set('threatPick', pick);
    p.memory.set('threatPickAt', p.now);
    return pick;
}

const threatTargeting = (p: Picture) => p.memory.get('threatTarget') === true;

/** The enemy the captain closes on: the one nearest an allied station in sight, else the nearest (as `closeOrder` fills it). */
const closeTarget = (radar: Radar | undefined) => stationThreat(radar)?.enemy ?? nearestEnemy(radar);

/** The captain's close target for this picture: by `threatPick` with `threatTarget`, else `closeTarget`. */
const closeTargetOf = (p: Picture) => (threatTargeting(p) && threatPick(p)?.enemy) || closeTarget(p.radar);

/** Whether `pick`'s enemy (the nearest by default) is inside the reference missile's launch envelope for how it moves. */
function enemyInEnvelope({ radar, previous, seconds }: Picture, pick = nearestEnemy) {
    const enemy = pick(radar);
    return enemy && inLaunchEnvelope(enemy.distance, launchRange(enemy, radar, previous, seconds));
}

/** Captain: whether `pick`'s enemy is inside the envelope, by its own reckoning or as weapons just reported it. */
function enemyInside(p: Picture, pick = nearestEnemy) {
    const own = enemyInEnvelope(p, pick);
    return own === undefined ? undefined : own || wasHeard(p, 'weapons.in_envelope');
}

const isEnemyShip = (c: Contact | undefined, radar: Radar | undefined) =>
    c !== undefined && c.type === 'Spaceship' && c.faction !== undefined && c.faction !== radar?.ownShip?.faction;

/** Weapons: the enemy ship the lock holds now, if any. */
function lockedEnemy(p: Picture) {
    const locked = lockedContact(p.display);
    return isEnemyShip(locked, p.radar) ? locked : undefined;
}

/** Weapons: whether the locked enemy is inside the envelope now (undefined without a lock). */
function lockInEnvelope(display: Display | undefined, previous: Radar | undefined, seconds: number) {
    const locked = display && lockedContact(display);
    const radar = display?.radar as Radar | undefined;
    return locked && isEnemyShip(locked, radar)
        ? inLaunchEnvelope(locked.distance, launchRange(locked, radar, previous, seconds))
        : undefined;
}

/** Weapons: the enemy ship the lock held at the previous decision, when it holds no ship now and that ship is gone or unlocked. */
function lostEnemy(p: Picture) {
    const before = p.previousDisplay && lockedContact(p.previousDisplay);
    if (!before || !isEnemyShip(before, p.previous) || lockedContact(p.display)?.id === before.id) {
        return undefined;
    }
    // a lock moved on to another ship is a new lock, not a lost one
    return lockedEnemy(p) ? undefined : before;
}

/** Whether a wreck lies where `ship` was last seen and the ship itself is gone from the radar. */
function wreckOf(ship: Contact, radar: Radar | undefined) {
    const contacts = radar?.contacts ?? [];
    if (contacts.some((c) => c.id === ship.id && c.type === 'Spaceship')) {
        return false;
    }
    return contacts.some(
        (c) =>
            c.type !== undefined &&
            c.type !== 'Spaceship' &&
            (c.radius ?? 0) >= SHIP_RADIUS_METERS &&
            c.position &&
            ship.position &&
            Math.hypot(c.position.x - ship.position.x, c.position.y - ship.position.y) <= WRECK_METERS,
    );
}

/** Whether `speaker.callout` was heard lately (within the channel's window). */
const wasHeard = (p: Picture, speakerCallout: string) =>
    p.heard.some((h) => `${h.speaker}.${h.callout}` === speakerCallout);

/** Captain: whether weapons' latest word on its line of fire is check fire (true), line clear (false), or neither. */
function lineFouled(p: Picture) {
    const latest = p.heard
        .filter((h) => h.speaker === 'weapons' && (h.callout === 'check_fire' || h.callout === 'line_clear'))
        .sort((a, b) => a.secondsAgo - b.secondsAgo)[0];
    return latest && latest.callout === 'check_fire';
}

/**
 * Captain: whether the enemies now threaten another station than the one the standing focus picks by:
 * the enemy nearest any allied station is nearer to it, by a margin, than any enemy is to the focus station,
 * and no enemy was seen near the focus station lately.
 */
function threatMoved(p: Picture) {
    if (threatTargeting(p)) {
        const picked = threatPick(p)?.station.name;
        return picked !== undefined && picked !== p.focusStation;
    }
    const threat = stationThreat(p.radar);
    if (!p.focusStation || !threat || threat.station.name === p.focusStation) {
        return false;
    }
    const focus = (p.radar?.contacts ?? []).find((c) => c.name === p.focusStation && c.position);
    if (!focus) {
        return false;
    }
    const gaps = (p.radar?.contacts ?? [])
        .filter((c) => isEnemyShip(c, p.radar) && c.position)
        .map((c) => Math.hypot(c.position!.x - focus.position!.x, c.position!.y - focus.position!.y));
    const held = Math.min(...gaps);
    if (held <= referenceKnobs.STATION_HELD_METERS) {
        p.memory.set('focusHeldAt', p.now);
    }
    const heldAt = (p.memory.get('focusHeldAt') as number | undefined) ?? -Infinity;
    return (
        p.now - heldAt > referenceKnobs.STATION_HELD_SECONDS && held - threat.gap > referenceKnobs.REFOCUS_MARGIN_METERS
    );
}

/**
 * Weapons: the share of the shells left, against the largest capacity the magazine showed: damage
 * shrinks the capacity, and a magazine full to its shrunken capacity is still short of shells.
 */
function shellShare(p: Picture) {
    const stock = shellStock(p.display);
    if (!stock) return undefined;
    const peak = resupplyOf(p).byCapacity
        ? stock.max
        : Math.max(stock.max, (p.memory.get('shellCapacity') as number | undefined) ?? 0);
    p.memory.set('shellCapacity', peak);
    return peak > 0 ? stock.count / peak : undefined;
}

/** Captain: whether weapons last called the shells low (true) or restocked (false), as remembered across decisions. */
function shellsLow(p: Picture) {
    if (wasHeard(p, 'weapons.shells_low')) p.memory.set('shellsLow', true);
    if (wasHeard(p, 'weapons.shells_restocked')) p.memory.set('shellsLow', false);
    return p.memory.get('shellsLow') === true;
}

/** Captain: whether an enemy ship is within `DOCK_CLEAR_METERS`. */
const enemyNear = (p: Picture) =>
    (nearestEnemy(p.radar)?.distance ?? Infinity) < (resupplyOf(p).dockClearMeters ?? DOCK_CLEAR_METERS);

/** Captain: whether it keeps its last order because signals reported the enemy lost a moment ago. */
function holdingOnLostContact(p: Picture) {
    if (wasHeard(p, 'signals.contact_lost')) {
        p.memory.set('lostUntil', p.now + referenceKnobs.CONTACT_LOST_HOLD_SECONDS);
    }
    return nearestEnemy(p.radar) === undefined && p.now < ((p.memory.get('lostUntil') as number | undefined) ?? -1);
}

/** The reference's rule for each callout it knows: whether the callout should be said now. */
/** The window the losing → hold rule counts station attack seconds over. */
const LOSING_WINDOW_SECONDS = 60;

/**
 * Captain, losing → hold (`LOSING_ATTACK_SECONDS`): after `LOSING_AFTER_SECONDS`, an enemy sat within
 * `ATTACK_METERS` of an allied station for `LOSING_ATTACK_SECONDS` of the last minute, or
 * `LOSING_ENEMIES` enemies are in sight. Counts the attack at every call, so call it once per decision.
 */
function losing(p: Picture) {
    if (referenceKnobs.LOSING_ATTACK_SECONDS <= 0) return false;
    const marks = (p.memory.get('stationAttacked') as number[] | undefined) ?? [];
    if (p.memory.get('stationAttackedAt') !== p.now) {
        const threat = stationThreat(p.radar);
        if (threat && threat.gap <= referenceKnobs.ATTACK_METERS) marks.push(p.now);
        while (marks.length && marks[0] < p.now - LOSING_WINDOW_SECONDS) marks.shift();
        p.memory.set('stationAttacked', marks);
        p.memory.set('stationAttackedAt', p.now);
    }
    if (p.now < referenceKnobs.LOSING_AFTER_SECONDS) return false;
    const attacked = marks.length * p.seconds >= referenceKnobs.LOSING_ATTACK_SECONDS;
    const many =
        referenceKnobs.LOSING_ENEMIES > 0 &&
        (p.radar?.contacts ?? []).filter((c) => isEnemyShip(c, p.radar)).length >= referenceKnobs.LOSING_ENEMIES;
    return attacked || many;
}

/** Captain, restock window (`RESTOCK_FROM_SECONDS`): the time to dock once and restock before the next raid. */
const restockWindow = (p: Picture) =>
    referenceKnobs.RESTOCK_FROM_SECONDS > 0 &&
    p.now >= referenceKnobs.RESTOCK_FROM_SECONDS &&
    p.now < referenceKnobs.RESTOCK_UNTIL_SECONDS;

/**
 * Captain, losing → dock (`DOCK_LOSING_STATION_HP`, `DOCK_LOSING_ATTACK_SECONDS`): once, after
 * `DOCK_LOSING_AFTER_SECONDS`, while allied stations dropped off the dradis below the knob's share of the
 * most seen, or an enemy sat within `ATTACK_METERS` of one for the knob's seconds of the last minute.
 * Tracks at every call, so call it once per decision.
 */
function losingDock(p: Picture) {
    const { DOCK_LOSING_STATION_HP: share, DOCK_LOSING_ATTACK_SECONDS: seconds } = referenceKnobs;
    if (share <= 0 && seconds <= 0) return false;
    const marks = (p.memory.get('dockAttacked') as number[] | undefined) ?? [];
    if (p.memory.get('dockAttackedAt') !== p.now) {
        const threat = stationThreat(p.radar);
        if (threat && threat.gap <= referenceKnobs.ATTACK_METERS) marks.push(p.now);
        while (marks.length && marks[0] < p.now - LOSING_WINDOW_SECONDS) marks.shift();
        p.memory.set('dockAttacked', marks);
        p.memory.set('dockAttackedAt', p.now);
    }
    const stations = alliedStations(p.radar).length;
    const most = Math.max(stations, (p.memory.get('stationsSeen') as number | undefined) ?? 0);
    p.memory.set('stationsSeen', most);
    if (p.now < referenceKnobs.DOCK_LOSING_AFTER_SECONDS || p.memory.get('losingDocked') !== undefined) return false;
    return (share > 0 && most > 0 && stations / most < share) || (seconds > 0 && marks.length * p.seconds >= seconds);
}

/** How long a losing → dock keeps the ship at the station: the run-A dock branch's travel plus its 60 s alongside. */
const LOSING_DOCK_HOLD_SECONDS = 120;

/** Captain: within `LOSING_DOCK_HOLD_SECONDS` of a losing → dock order, nothing casts off. */
const losingDockHeld = (p: Picture) => {
    const at = p.memory.get('losingDocked') as number | undefined;
    return at !== undefined && p.now < at + LOSING_DOCK_HOLD_SECONDS;
};

/**
 * Captain, lull → dock (`LULL_DOCK_MISSILES`): inside the lull window, weapons last called at most the knob's
 * missiles left, and no enemy is within `LULL_DOCK_CLEAR_METERS` of an allied station. Remembers the latest
 * magazine count heard, so call it once per decision.
 */
function lullDock(p: Picture) {
    const k = referenceKnobs.LULL_DOCK_MISSILES;
    if (k <= 0) return false;
    const call = p.heard
        .filter((h) => h.speaker === 'weapons' && h.callout === 'salvo_away' && h.values?.magazine !== undefined)
        .sort((a, b) => a.secondsAgo - b.secondsAgo)[0];
    if (call) p.memory.set('missilesHeard', Number(call.values!.magazine));
    const left = p.memory.get('missilesHeard') as number | undefined;
    return (
        p.memory.get('lullDocked') === undefined &&
        p.now >= referenceKnobs.LULL_DOCK_FROM_SECONDS &&
        p.now < referenceKnobs.LULL_DOCK_UNTIL_SECONDS &&
        left !== undefined &&
        left <= k &&
        !lullBroken(p)
    );
}

/** Captain: an enemy within `LULL_DOCK_CLEAR_METERS` of an allied station. */
const lullBroken = (p: Picture) => (stationThreat(p.radar)?.gap ?? Infinity) < referenceKnobs.LULL_DOCK_CLEAR_METERS;

/** Captain: within `LULL_DOCK_HOLD_SECONDS` of a lull dock order, while the lull holds. */
const lullDockHeld = (p: Picture) => {
    const at = p.memory.get('lullDocked') as number | undefined;
    return at !== undefined && p.now < at + referenceKnobs.LULL_DOCK_HOLD_SECONDS && !lullBroken(p);
};

/**
 * Captain, conditional restock (`RESTOCK_BELOW_CAPACITY`): the engineer last called the magazine's capacity
 * below the knob, or weapons called the shells low. Remembers the latest capacity heard.
 */
function restockNeeded(p: Picture) {
    const below = referenceKnobs.RESTOCK_BELOW_CAPACITY;
    if (below <= 0) return true;
    const call = p.heard
        .filter((h) => h.speaker === 'engineer' && h.callout === 'magazine_state' && h.values?.capacity !== undefined)
        .sort((a, b) => a.secondsAgo - b.secondsAgo)[0];
    if (call) p.memory.set('magazineCapacity', Number(call.values!.capacity));
    const capacity = p.memory.get('magazineCapacity') as number | undefined;
    return (capacity !== undefined && capacity < below) || shellsLow(p);
}

/** How often the engineer repeats an unchanged magazine state. */
const MAGAZINE_STATE_REPEAT_SECONDS = 30;

/** Captain: an enemy within `RESTOCK_CLEAR_METERS` keeps or sends the ship off a restock-window dock. */
const restockBlocked = (p: Picture) =>
    (nearestEnemy(p.radar)?.distance ?? Infinity) < referenceKnobs.RESTOCK_CLEAR_METERS;

/** Captain, late stance (`LATE_STANCE_MODE`): the knob's stance, once, from `LATE_STANCE_SECONDS` on. */
const lateStance = (stance: 'offensive' | 'all_out', mode: number) => (p: Picture) => {
    if (
        referenceKnobs.LATE_STANCE_MODE !== mode ||
        p.now < referenceKnobs.LATE_STANCE_SECONDS ||
        p.memory.get('lateStanceSet') !== undefined
    )
        return false;
    p.memory.set('lateStanceSet', stance);
    return true;
};

const calloutRules: Record<string, (picture: Picture) => boolean> = {
    offensive: lateStance('offensive', 1),
    all_out: lateStance('all_out', 2),
    /** Engineer: the magazine's capacity changed by a tenth since last said, or a while passed. */
    magazine_state: ({ display, memory, now }) => {
        const capacity = magazineCapacity(display.panels);
        const last = memory.get('magazineSaid') as { capacity: number; at: number } | undefined;
        if (last && Math.abs(last.capacity - capacity) < 0.1 && now - last.at < MAGAZINE_STATE_REPEAT_SECONDS) {
            return false;
        }
        memory.set('magazineSaid', { capacity, at: now });
        return true;
    },
    /** Signals: the enemy ship shown at the previous decision is gone from the radar. */
    contact_lost: ({ radar, previous }) => {
        const before = nearestEnemy(previous);
        return before !== undefined && !(radar?.contacts ?? []).some((c) => c.id === before.id);
    },
    /** Signals: whenever an identified enemy ship is on the radar. */
    enemy_position: ({ radar }) => nearestEnemy(radar) !== undefined,
    /** Weapons: the locked enemy disappeared, and a wreck lies where it was. */
    target_destroyed: (p) => {
        const lost = lostEnemy(p);
        return lost !== undefined && wreckOf(lost, p.radar);
    },
    /** Weapons: the lock on an enemy ship dropped without a wreck to show for it. */
    lost_lock: (p) => {
        const lost = lostEnemy(p);
        return lost !== undefined && !wreckOf(lost, p.radar);
    },
    /** Weapons: the targeting panel calls check fire; said when it starts, and again every few seconds while it holds. */
    check_fire: (p) => {
        if (!checkFireOf(p.display.panels)) {
            p.memory.delete('checkFireSaidAt');
            return false;
        }
        const said = p.memory.get('checkFireSaidAt') as number | undefined;
        if (said !== undefined && p.now - said < CHECK_FIRE_REPEAT_SECONDS) {
            return false;
        }
        p.memory.set('checkFireSaidAt', p.now);
        return true;
    },
    /** Weapons: the check-fire line cleared since the previous decision. */
    line_clear: (p) =>
        !checkFireOf(p.display.panels) &&
        p.previousDisplay !== undefined &&
        checkFireOf(p.previousDisplay.panels) !== undefined,
    /** Weapons: a missile leaves a tube at this decision. */
    salvo_away: ({ salvo }) => salvo !== undefined,
    /** Weapons: the lock holds an enemy ship it did not hold at the previous decision. */
    target_locked: (p) => {
        const locked = lockedEnemy(p);
        return locked !== undefined && (p.previousDisplay && lockedContact(p.previousDisplay))?.id !== locked.id;
    },
    /** Weapons: the locked enemy is inside the launch envelope, not yet said for this lock since it came inside. */
    in_envelope: (p) => {
        const locked = lockedEnemy(p);
        if (!locked || lockInEnvelope(p.display, p.previous, p.seconds) !== true) {
            p.memory.delete('inSaidFor');
            return false;
        }
        if (p.memory.get('inSaidFor') === locked.id) {
            return false;
        }
        p.memory.set('inSaidFor', locked.id);
        return true;
    },
    /** Weapons: the locked enemy is beyond the envelope; said when that starts, and again every few seconds. */
    out_of_envelope: (p) => {
        if (lockInEnvelope(p.display, p.previous, p.seconds) !== false) {
            p.memory.delete('outSaidAt');
            return false;
        }
        const said = p.memory.get('outSaidAt') as number | undefined;
        if (said !== undefined && p.now - said < OUT_OF_ENVELOPE_REPEAT_SECONDS) {
            return false;
        }
        p.memory.set('outSaidAt', p.now);
        return true;
    },
    /**
     * Captain: an enemy outside the launch envelope (by its own reckoning, and weapons has not just
     * reported it inside); or inside it and already ordered engaged, to bring the ship to gun range
     * while the missiles fly. Never at an enemy nearer than `CLOSE_STOP_METERS`.
     */
    close_to: (picture) => {
        const target = closeTargetOf(picture);
        if (target && target.distance < referenceKnobs.CLOSE_STOP_METERS) return false;
        if (losing(picture)) return false;
        const inside = enemyInside(picture, () => target);
        return inside === false || (inside === true && target?.name === picture.engaged);
    },
    /** Captain: an enemy inside the launch envelope, by its own reckoning or as weapons reports it, not yet ordered engaged. */
    engage: (picture) =>
        !picture.focusOrdered && enemyInside(picture) === true && nearestEnemy(picture.radar)?.name !== picture.engaged,
    /** Weapons: the shells fell below the low share of the capacity the magazine began with, since the last call. */
    shells_low: (p) => {
        const share = shellShare(p);
        if (
            share === undefined ||
            share >= (resupplyOf(p).lowShare ?? referenceKnobs.SHELLS_LOW) ||
            p.memory.get('shellsLowSaid') === true
        )
            return false;
        p.memory.set('shellsLowSaid', true);
        return true;
    },
    /** Weapons: the shells are back above the restocked share after a low call. */
    shells_restocked: (p) => {
        const share = shellShare(p);
        if (
            share === undefined ||
            share < (resupplyOf(p).restockedShare ?? SHELLS_RESTOCKED) ||
            p.memory.get('shellsLowSaid') !== true
        )
            return false;
        p.memory.set('shellsLowSaid', false);
        return true;
    },
    /** Captain: weapons called the shells low, no enemy is near and an allied station is close: dock to restock. */
    dock_for_repair: (p) => {
        const station = (p.radar?.contacts ?? []).filter(
            (c) =>
                c.type === 'Spaceship' &&
                c.faction === p.radar?.ownShip?.faction &&
                (c.radius ?? 0) >= STATION_RADIUS_METERS,
        );
        const near = station.some((c) => c.distance < DOCK_NEAR_METERS);
        if (
            restockWindow(p) &&
            restockNeeded(p) &&
            !p.dockOrdered &&
            !p.memory.get('restockDocked') &&
            !restockBlocked(p) &&
            near
        ) {
            p.memory.set('restockDocked', true);
            return true;
        }
        if (!p.dockOrdered && p.memory.get('lullDockNow') === p.now) {
            p.memory.set('lullDocked', p.now);
            return true;
        }
        if (!p.dockOrdered && p.memory.get('losingDockNow') === p.now) {
            p.memory.set('losingDocked', p.now);
            return true;
        }
        return shellsLow(p) && !p.dockOrdered && !enemyNear(p) && near;
    },
    /** Captain: docked and the shells are restocked, or an enemy comes near: cast off; never inside a losing → dock's hold. */
    undock: (p) =>
        p.dockOrdered &&
        !losingDockHeld(p) &&
        !lullDockHeld(p) &&
        (p.memory.get('restockDocked') === true && !p.memory.get('restockUndocked')
            ? (restockBlocked(p) || p.now >= referenceKnobs.RESTOCK_UNTIL_SECONDS) &&
              (p.memory.set('restockUndocked', true), true)
            : !shellsLow(p) || enemyNear(p)),
    /** Captain: weapons calls check fire, and the board holds no check fire yet. */
    call_check_fire: (p) => !p.checkFireOrdered && lineFouled(p) === true,
    /** Captain: weapons calls the line clear, and the board still holds check fire. */
    clear_to_fire: (p) => p.checkFireOrdered && lineFouled(p) === false,
    /**
     * Captain: two or more enemy ships in sight, and the board holds no focus yet; or the standing
     * focus picks by a station the enemies no longer threaten most.
     */
    focus: (p) =>
        p.focusOrdered ? threatMoved(p) : (p.radar?.contacts ?? []).filter((c) => isEnemyShip(c, p.radar)).length >= 2,
    /** Captain: fire discipline once it ordered an enemy engaged and the board holds no salvo yet. */
    salvo: (p) => p.engaged !== undefined && !p.salvoOrdered && nearestEnemy(p.radar) !== undefined,
    /**
     * Captain: run the enemy down to gun range, with a fresh fix whenever nothing more urgent is said,
     * so the ship never parks at missile range; not while a focus spreads the fight over several enemies.
     */
    chase_target: (p) => !p.focusOrdered && nearestEnemy(p.radar) !== undefined,
    /**
     * Captain with `guardCentre`: no enemy in sight, none reported lost a moment ago, no dock order, and the
     * ship is off the centre of the allied stations in sight: the next raid may come at any of them.
     */
    guard_station: (p) => {
        if (p.memory.get('guardCentre') !== true || p.dockOrdered || holdingOnLostContact(p) || nearestEnemy(p.radar)) {
            return false;
        }
        const centre = stationsCentre(p.radar);
        const own = p.radar?.ownShip?.position;
        return !!centre && !!own && Math.hypot(centre.x - own.x, centre.y - own.y) > referenceKnobs.GUARD_SLACK_METERS;
    },
    /** Captain: no enemy in sight, and none reported lost a moment ago. */
    hold_here: (p) => !holdingOnLostContact(p) && (nearestEnemy(p.radar) === undefined || losing(p)),
};

/** The captain's rules that must see a lost contact first, so the hold on it is noted before any other rule. */
const CAPTAIN_HOLD = 'hold_here';

/** What the seat remembers for its callouts: one per seat. */
export function calloutMemory(resupply: Resupply = {}, threatTarget = false, guardCentre = false) {
    return {
        memory: new Map<string, unknown>([
            ['resupply', resupply],
            ['threatTarget', threatTarget],
            ['guardCentre', guardCentre],
        ]),
        now: 0,
    };
}

/**
 * What a reference seat says: the first of its brain's callouts whose rule fires, else silence.
 * Undefined, so the seat says nothing at all, for a brain none of whose callouts has a rule.
 */
export function referenceCallout(
    request: BrainRequest,
    display: Display,
    previous: Display | undefined,
    seconds: number,
    /** The ship this seat last ordered engaged. */
    engaged?: string,
    {
        heard = [],
        state = calloutMemory(),
        salvo,
        salvoOrdered = false,
        focusOrdered = false,
        focusStation,
        checkFireOrdered = false,
        dockOrdered = false,
    }: {
        heard?: readonly Heard[];
        state?: ReturnType<typeof calloutMemory>;
        salvo?: SalvoTally;
        salvoOrdered?: boolean;
        focusOrdered?: boolean;
        focusStation?: string;
        checkFireOrdered?: boolean;
        dockOrdered?: boolean;
    } = {},
): Answer | undefined {
    const options = Object.keys(request.questions?.[CALLOUT_QUESTION]?.criteria ?? {}).filter((o) => o in calloutRules);
    if (!options.length) {
        return undefined;
    }
    state.now += seconds;
    const picture: Picture = {
        display,
        radar: display.radar as Radar | undefined,
        previousDisplay: previous,
        previous: previous?.radar as Radar | undefined,
        seconds,
        engaged,
        heard,
        memory: state.memory,
        now: state.now,
        salvo,
        salvoOrdered,
        focusOrdered,
        focusStation,
        checkFireOrdered,
        dockOrdered,
    };
    // a lost contact is noted whatever the captain says, so the hold covers the following decisions
    if (options.includes(CAPTAIN_HOLD)) {
        holdingOnLostContact(picture);
    }
    if (options.includes('dock_for_repair')) {
        shellsLow(picture);
        if (losingDock(picture)) picture.memory.set('losingDockNow', picture.now);
        if (lullDock(picture)) picture.memory.set('lullDockNow', picture.now);
    }
    const choice = options.find((o) => calloutRules[o](picture)) ?? SILENCE;
    const picked = threatTargeting(picture) ? threatPick(picture) : undefined;
    return {
        choice,
        source: 'rule',
        ...(choice === 'salvo_away' && salvo
            ? { values: { n: String(salvo.n), in_flight: String(salvo.inFlight) } }
            : {}),
        ...(picked && (choice === 'close_to' || choice === 'chase_target')
            ? { values: { target: picked.enemy.name ?? '' } }
            : {}),
        ...(picked && choice === 'focus' ? { values: { station: picked.station.name ?? '' } } : {}),
    };
}
