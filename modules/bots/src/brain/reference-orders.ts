import { CALLOUT_QUESTION, Heard, SILENCE, checkFireOf, stationThreat } from './callout';
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
const CONTACT_LOST_HOLD_SECONDS = 15;
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
const REFOCUS_MARGIN_METERS = 5000;
/** Nor while an enemy is still this near the focus station: its attackers come first. */
const STATION_HELD_METERS = 10_000;
/** Seconds an enemy last seen near the focus station keeps the focus: far contacts drop off the radar for a decision or two. */
const STATION_HELD_SECONDS = 30;

/** Weapons calls the shells low below this share of the magazine, and restocked once they are back above `SHELLS_RESTOCKED`. */
const SHELLS_LOW = 0.4;
const SHELLS_RESTOCKED = 0.8;
/** The captain docks to restock only with no enemy within this range, and casts off when one comes inside it. */
const DOCK_CLEAR_METERS = 100_000;
/** Nor with the nearest allied station farther than this: the ship would be docking while the stations fall. */
const DOCK_NEAR_METERS = 45_000;

/** The enemy the captain closes on: the one nearest an allied station in sight, else the nearest (as `closeOrder` fills it). */
const closeTarget = (radar: Radar | undefined) => stationThreat(radar)?.enemy ?? nearestEnemy(radar);

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
    if (held <= STATION_HELD_METERS) {
        p.memory.set('focusHeldAt', p.now);
    }
    const heldAt = (p.memory.get('focusHeldAt') as number | undefined) ?? -Infinity;
    return p.now - heldAt > STATION_HELD_SECONDS && held - threat.gap > REFOCUS_MARGIN_METERS;
}

/**
 * Weapons: the share of the shells left, against the largest capacity the magazine showed: damage
 * shrinks the capacity, and a magazine full to its shrunken capacity is still short of shells.
 */
function shellShare(p: Picture) {
    const stock = shellStock(p.display);
    if (!stock) return undefined;
    const peak = Math.max(stock.max, (p.memory.get('shellCapacity') as number | undefined) ?? 0);
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
const enemyNear = (p: Picture) => (nearestEnemy(p.radar)?.distance ?? Infinity) < DOCK_CLEAR_METERS;

/** Captain: whether it keeps its last order because signals reported the enemy lost a moment ago. */
function holdingOnLostContact(p: Picture) {
    if (wasHeard(p, 'signals.contact_lost')) {
        p.memory.set('lostUntil', p.now + CONTACT_LOST_HOLD_SECONDS);
    }
    return nearestEnemy(p.radar) === undefined && p.now < ((p.memory.get('lostUntil') as number | undefined) ?? -1);
}

/** The reference's rule for each callout it knows: whether the callout should be said now. */
const calloutRules: Record<string, (picture: Picture) => boolean> = {
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
     * while the missiles fly.
     */
    close_to: (picture) => {
        const inside = enemyInside(picture, closeTarget);
        return inside === false || (inside === true && closeTarget(picture.radar)?.name === picture.engaged);
    },
    /** Captain: an enemy inside the launch envelope, by its own reckoning or as weapons reports it, not yet ordered engaged. */
    engage: (picture) =>
        !picture.focusOrdered && enemyInside(picture) === true && nearestEnemy(picture.radar)?.name !== picture.engaged,
    /** Weapons: the shells fell below the low share of the capacity the magazine began with, since the last call. */
    shells_low: (p) => {
        const share = shellShare(p);
        if (share === undefined || share >= SHELLS_LOW || p.memory.get('shellsLowSaid') === true) return false;
        p.memory.set('shellsLowSaid', true);
        return true;
    },
    /** Weapons: the shells are back above the restocked share after a low call. */
    shells_restocked: (p) => {
        const share = shellShare(p);
        if (share === undefined || share < SHELLS_RESTOCKED || p.memory.get('shellsLowSaid') !== true) return false;
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
        return shellsLow(p) && !p.dockOrdered && !enemyNear(p) && station.some((c) => c.distance < DOCK_NEAR_METERS);
    },
    /** Captain: docked and the shells are restocked, or an enemy comes near: cast off. */
    undock: (p) => p.dockOrdered && (!shellsLow(p) || enemyNear(p)),
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
    /** Captain: no enemy in sight, and none reported lost a moment ago. */
    hold_here: (p) => !holdingOnLostContact(p) && nearestEnemy(p.radar) === undefined,
};

/** The captain's rules that must see a lost contact first, so the hold on it is noted before any other rule. */
const CAPTAIN_HOLD = 'hold_here';

/** What the seat remembers for its callouts: one per seat. */
export function calloutMemory() {
    return { memory: new Map<string, unknown>(), now: 0 };
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
    }
    const choice = options.find((o) => calloutRules[o](picture)) ?? SILENCE;
    return {
        choice,
        source: 'rule',
        ...(choice === 'salvo_away' && salvo
            ? { values: { n: String(salvo.n), in_flight: String(salvo.inFlight) } }
            : {}),
    };
}
