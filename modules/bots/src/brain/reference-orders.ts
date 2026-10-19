import { CALLOUT_QUESTION, Heard, SILENCE } from './callout';
import { Contact, Radar } from './verbal';
import { inLaunchEnvelope, launchRange, lockedContact, nearestEnemy } from './engagement';

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
};

/** Seconds the captain keeps its last order after signals reports the enemy lost: a contact drops for a few seconds when the relaying station is hit. */
const CONTACT_LOST_HOLD_SECONDS = 15;
/** Seconds between two weapons reports that the locked ship is still beyond the envelope. */
const OUT_OF_ENVELOPE_REPEAT_SECONDS = 10;
/** A wreck this near where the lost ship was last seen says the ship was destroyed, not lost. */
const WRECK_METERS = 1000;
const SHIP_RADIUS_METERS = 5;

/** Whether the nearest enemy is inside the reference missile's launch envelope for how it moves. */
function enemyInEnvelope({ radar, previous, seconds }: Picture) {
    const enemy = nearestEnemy(radar);
    return enemy && inLaunchEnvelope(enemy.distance, launchRange(enemy, radar, previous, seconds));
}

/** Captain: whether the nearest enemy is inside the envelope, by its own reckoning or as weapons just reported it. */
function enemyInside(p: Picture) {
    const own = enemyInEnvelope(p);
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
        const inside = enemyInside(picture);
        return inside === false || (inside === true && nearestEnemy(picture.radar)?.name === picture.engaged);
    },
    /** Captain: an enemy inside the launch envelope, by its own reckoning or as weapons reports it, not yet ordered engaged. */
    engage: (picture) =>
        !picture.focusOrdered && enemyInside(picture) === true && nearestEnemy(picture.radar)?.name !== picture.engaged,
    /** Captain: two or more enemy ships in sight, and the board holds no focus yet. */
    focus: (p) => !p.focusOrdered && (p.radar?.contacts ?? []).filter((c) => isEnemyShip(c, p.radar)).length >= 2,
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
    }: {
        heard?: readonly Heard[];
        state?: ReturnType<typeof calloutMemory>;
        salvo?: SalvoTally;
        salvoOrdered?: boolean;
        focusOrdered?: boolean;
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
    };
    // a lost contact is noted whatever the captain says, so the hold covers the following decisions
    if (options.includes(CAPTAIN_HOLD)) {
        holdingOnLostContact(picture);
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
