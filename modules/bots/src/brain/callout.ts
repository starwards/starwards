import { BrainSpec, CalloutFill } from './spec';
import { Contact, Radar, offNose } from './verbal';
import {
    GUN_CLOSE_METERS,
    bearingWords,
    closeRange,
    launchRange,
    lockedContact,
    missilesInMagazine,
    nearestEnemy,
    offNoseWords,
} from './engagement';
import { SALVO_MISSILES, radarReach } from '@starwards/core/internal';

import { ChoiceQuestion } from './request';
import { Display } from './controls';

/** The question id of a brain's callout, beside its controls' questions. */
export const CALLOUT_QUESTION = 'callout';
/** The callout option that says nothing. */
export const SILENCE = 'silence';

/**
 * A callout as a listener hears it: which station said it, which of its callout options (absent in
 * runs recorded before options were carried), the phrase as said, the values filled into it, and how
 * many seconds ago.
 */
export type Heard = {
    speaker: string;
    callout?: string;
    phrase: string;
    values?: FillValues;
    secondsAgo: number;
};

/**
 * What a seat puts on the air: the callout option it chose and the phrase with its values filled in
 * (`values`, by placeholder). `seat` names the member seat that said it, for a fused brain's callouts.
 */
export type Said = { callout: string; phrase: string; values?: FillValues; seat?: string };

/** The callout question of one seat of a fused brain. */
function seatCalloutQuestion(seat: string) {
    return `${CALLOUT_QUESTION}:${seat}`;
}

type Callouts = NonNullable<BrainSpec['callouts']>;

/** Every callout question a brain asks, by question id, with the callouts it chooses among and the seat that says them. */
export function calloutSources(spec: BrainSpec): { question: string; callouts: Callouts; seat?: string }[] {
    const sources: { question: string; callouts: Callouts; seat?: string }[] = spec.callouts
        ? [{ question: CALLOUT_QUESTION, callouts: spec.callouts }]
        : [];
    for (const [seat, { callouts }] of Object.entries(spec.seats ?? {})) {
        if (callouts) {
            sources.push({ question: seatCalloutQuestion(seat), callouts, seat });
        }
    }
    return sources;
}

type FillValues = Record<string, string>;

const SILENCE_CRITERION =
    'say nothing: the crew hears nothing new from you. Choose this when nothing the crew needs to know has changed since you last spoke.';

/** Degrees and side of a signed angle, positive to the right; undefined under 1°, where there is nothing to say. */
function degreesAndSide(degrees: number): FillValues | undefined {
    const size = Math.round(Math.abs(degrees));
    return size < 1 ? undefined : { degrees: String(size), side: degrees > 0 ? 'right' : 'left' };
}

/**
 * The values a parameterised callout reads off the SPEAKER's own display (and the one it read at its
 * previous decision, for a change over time), so a seat can only say what its station shows. Undefined
 * when the display does not show it: the callout is then not said.
 */
const calloutFills: Record<
    CalloutFill,
    (
        display: Display,
        previous: Display | undefined,
        seconds: number,
        /** Values the speaking seat supplies from what it remembers itself doing (its own launches). */
        supplied?: FillValues,
    ) => FillValues | undefined
> = {
    /** Weapons: how far the locked contact lies off the nose (the gun line), and to which side. */
    lockedOffNose: ({ panels, radar }) => {
        const targetId = (panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
        const r = radar as Radar | undefined;
        const locked = targetId ? r?.contacts?.find((c) => c.id === targetId) : undefined;
        return locked && r?.ownShip ? degreesAndSide(offNose(locked.bearing, r.ownShip.heading)) : undefined;
    },
    /** Engineer: how far damage has bent a chain gun off the nose, from the damage report. */
    gunSkew: ({ panels }) => {
        const report = panels['damage-report'];
        const skew = Array.isArray(report)
            ? (report as { system: string; field: string; value: number }[]).find(
                  (d) => d.system.startsWith('/chainGuns/') && d.field === 'bearingSkew',
              )
            : undefined;
        return skew && degreesAndSide(skew.value);
    },
    /**
     * Signals: the nearest contact its long-range radar shows beyond the helms radar's reach (outside
     * warp), which helms cannot see. Identified non-ships (rocks, nebulae) are left out; an
     * unidentified blip may be a ship, so it counts.
     */
    farContact: ({ radar }) => {
        const r = radar as Radar | undefined;
        const far = r?.contacts?.find(
            (c) => c.distance > radarReach.helms && (c.type === undefined || c.type === 'Spaceship'),
        );
        if (!far || !r?.ownShip) {
            return undefined;
        }
        return {
            name: far.name,
            range: (far.distance / 1000).toFixed(1),
            bearing: offNoseWords(far.bearing, r.ownShip.heading),
        };
    },
    /**
     * Signals: the nearest identified enemy ship on its radar, wherever the faction sees it, and how its
     * range moved since the previous decision.
     */
    enemyContact: ({ radar }, previous) => {
        const r = radar as Radar | undefined;
        const enemy = nearestEnemy(r);
        if (!enemy || !r?.ownShip) {
            return undefined;
        }
        const before = (previous?.radar as Radar | undefined)?.contacts?.find((c) => c.id === enemy.id);
        return {
            name: enemy.name,
            range: (enemy.distance / 1000).toFixed(1),
            bearing: offNoseWords(enemy.bearing, r.ownShip.heading),
            trend: before ? rangeTrend(enemy.distance - before.distance) : 'new contact',
        };
    },
    /**
     * Captain: close to missile range of the enemy that threatens an allied station most (nearest any
     * station in sight), else of the nearest enemy, which lies `distance` away on world `bearing`; the range is inside the envelope for how the enemy moves since the previous decision,
     * or gun range once the enemy is inside it.
     */
    closeOrder: ({ radar }, previous, seconds) => {
        const r = radar as Radar | undefined;
        // a straggler near the own ship must not drag it away from a station under attack
        const enemy = stationThreat(r)?.enemy ?? nearestEnemy(r);
        return (
            enemy && {
                name: enemy.name,
                range: (
                    closeRange(enemy.distance, launchRange(enemy, r, previous?.radar as Radar | undefined, seconds)) /
                    1000
                ).toFixed(0),
                distance: (enemy.distance / 1000).toFixed(1),
                bearing: bearingWords(enemy.bearing),
            }
        );
    },
    /**
     * Captain: close to gun range of the enemy that threatens an allied station most, else of the nearest
     * enemy, whatever its distance: the ship never parks at missile range while a focus has the crew fight
     * the raiders one after the other.
     */
    gunCloseOrder: ({ radar }) => {
        const r = radar as Radar | undefined;
        const enemy = stationThreat(r)?.enemy ?? nearestEnemy(r);
        return (
            enemy && {
                name: enemy.name,
                range: (GUN_CLOSE_METERS / 1000).toFixed(0),
                distance: (enemy.distance / 1000).toFixed(1),
                bearing: bearingWords(enemy.bearing),
            }
        );
    },
    /** Captain: dock at the nearest allied station (a ship-sized ally is no dock), `distance` away on world `bearing`. */
    dockOrder: ({ radar }) => {
        const station = alliedStations(radar as Radar | undefined).sort((a, b) => a.distance - b.distance)[0];
        return (
            station && {
                name: station.name,
                distance: (station.distance / 1000).toFixed(1),
                bearing: bearingWords(station.bearing),
                radius: ((station.radius ?? 0) / 1000).toFixed(1),
            }
        );
    },
    /**
     * Captain: patrol behind the nearest large body the dradis draws (a nebula: no ship, never scanned),
     * kept between the ship and the nearest enemy when one is in sight.
     */
    patrolOrder: ({ radar }) => {
        const r = radar as Radar | undefined;
        const body = (r?.contacts ?? [])
            .filter((c) => c.type !== 'Spaceship' && (c.radius ?? 0) >= BODY_RADIUS)
            .sort((a, b) => a.distance - b.distance)[0];
        const enemy = nearestEnemy(r);
        return (
            body && {
                name: body.name,
                distance: (body.distance / 1000).toFixed(1),
                bearing: bearingWords(body.bearing),
                radius: ((body.radius ?? 0) / 1000).toFixed(1),
                ...(enemy
                    ? { fromDistance: (enemy.distance / 1000).toFixed(1), fromBearing: bearingWords(enemy.bearing) }
                    : {}),
            }
        );
    },
    /** Weapons: the ally the targeting panel calls check fire on, in the line of fire before one by the target. */
    allyAtRisk: ({ panels }) => {
        const shown = checkFireOf(panels);
        return shown && { name: shown.ally.name, range: (shown.ally.distance / 1000).toFixed(1), where: shown.where };
    },
    /** Weapons: the ship the lock holds, by name. */
    lockedTarget: (display) => {
        const locked = lockedContact(display);
        return locked && { name: locked.name };
    },
    /**
     * Weapons: the locked ship's range, the launch envelope of the missile the reference loads for how
     * it moves since the previous decision, and how much range is still to close to it, km.
     */
    lockedEnvelope: (display, previous, seconds) => {
        const locked = lockedContact(display);
        const r = display.radar as Radar | undefined;
        if (!locked) {
            return undefined;
        }
        const envelope = launchRange(locked, r, previous?.radar as Radar | undefined, seconds);
        return {
            name: locked.name,
            range: (locked.distance / 1000).toFixed(1),
            envelope: (envelope / 1000).toFixed(0),
            range_to_go: (Math.max(0, locked.distance - envelope) / 1000).toFixed(1),
        };
    },
    /**
     * Weapons: the missiles left in the magazine, from the ammo panel, and the launches of the current
     * engagement and how many of them still fly, which only the seat itself counts: a seat that
     * supplies no count says nothing.
     */
    salvoTally: (display, _previous, _seconds, supplied) => {
        const magazine = missilesInMagazine(display);
        return supplied?.n === undefined || supplied.in_flight === undefined || magazine === undefined
            ? undefined
            : { n: supplied.n, in_flight: supplied.in_flight, magazine: String(magazine) };
    },
    /** Weapons: the ship the lock held at the previous decision, which it holds no more. */
    lostLock: (display, previous) => {
        const before = previous && lockedContact(previous);
        return before && lockedContact(display)?.id !== before.id ? { name: before.name } : undefined;
    },
    /**
     * Signals: the nearest enemy ship the radar showed at the previous decision and shows no more, and
     * its last world bearing.
     */
    lostContact: ({ radar }, previous) => {
        const before = nearestEnemy(previous?.radar as Radar | undefined);
        const now = (radar as Radar | undefined)?.contacts ?? [];
        return before && !now.some((c) => c.id === before.id)
            ? { name: before.name, last_bearing: bearingWords(before.bearing) }
            : undefined;
    },
    /**
     * Captain: the enemy ships in sight in the order to fight them. With an allied station in sight,
     * the focus picks the enemy nearest the station an enemy is nearest to, and the names follow that
     * order; otherwise the names are the order, nearest the own ship first.
     */
    focusOrder: ({ radar }) => {
        const r = radar as Radar | undefined;
        const own = r?.ownShip?.faction;
        const enemies = (r?.contacts ?? []).filter(
            (c) => c.type === 'Spaceship' && c.faction !== undefined && c.faction !== own,
        );
        if (!enemies.length) {
            return undefined;
        }
        const apart = (a: Contact, b: Contact) =>
            a.position && b.position ? Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) : Infinity;
        const station = stationThreat(r)?.station;
        const order = [...enemies].sort((x, y) =>
            station ? apart(x, station) - apart(y, station) : x.distance - y.distance,
        );
        const names = order.map((e) => e.name).join(', ');
        const values: FillValues = station
            ? {
                  names,
                  pick: 'nearest_to',
                  station: station.name,
                  focus: `the enemy nearest ${station.name} (${names})`,
              }
            : { names, focus: names };
        return values;
    },
    /** Captain: a salvo of the default size. */
    salvoOrder: () => ({ count: String(SALVO_MISSILES) }),
    /** Captain: engage the nearest enemy, by the name the crew's radars show. */
    engageOrder: ({ radar }) => {
        const enemy = nearestEnemy(radar as Radar | undefined);
        return enemy && { name: enemy.name };
    },
};

/** Allied stations on the radar: own-faction ships big enough to dock at. */
function alliedStations(r: Radar | undefined) {
    const own = r?.ownShip?.faction;
    return (r?.contacts ?? []).filter(
        (c) => c.type === 'Spaceship' && own !== undefined && c.faction === own && (c.radius ?? 0) >= DOCK_HOST_RADIUS,
    );
}

/** The identified enemy ship nearest any allied station on the radar, and that station. */
export function stationThreat(r: Radar | undefined) {
    const own = r?.ownShip?.faction;
    const stations = alliedStations(r).filter((s) => s.position);
    let best: { enemy: Contact; station: Contact; gap: number } | undefined;
    for (const enemy of r?.contacts ?? []) {
        if (enemy.type !== 'Spaceship' || enemy.faction === undefined || enemy.faction === own || !enemy.position) {
            continue;
        }
        for (const station of stations) {
            const gap = Math.hypot(enemy.position.x - station.position!.x, enemy.position.y - station.position!.y);
            if (!best || gap < best.gap) {
                best = { enemy, station, gap };
            }
        }
    }
    return best;
}

/** A contact this wide or wider is a station a ship docks at, not a ship. */
const DOCK_HOST_RADIUS = 200;
/** A blip this wide that is no ship is a body to hide behind: a nebula. */
const BODY_RADIUS = 2000;

/** A range change smaller than this between two decisions is called holding range. */
const RANGE_CHANGE_METERS = 50;

function rangeTrend(change: number) {
    return Math.abs(change) < RANGE_CHANGE_METERS ? 'holding range' : change < 0 ? 'closing' : 'opening';
}

/** What a seat heard, read out as an officer would: `Weapons said "target locked" 2 s ago`. */
export function heardLines(heard: readonly Heard[]): string[] {
    return heard.map(
        (h) =>
            `${h.speaker.charAt(0).toUpperCase()}${h.speaker.slice(1)} said "${h.phrase}" ${Math.round(h.secondsAgo)} s ago`,
    );
}

/** The heard callouts one control listens for (`hears`: `<station>.<callout option>`), read out as `heardLines`. */
export function heardFor(heard: readonly Heard[], hears: readonly string[]): string[] {
    return heardLines(heard.filter((h) => h.callout !== undefined && hears.includes(`${h.speaker}.${h.callout}`)));
}

/**
 * The callout questions of a brain, by question id: one option per phrase, described by what saying
 * it tells the crew and when to say it, plus `silence`. Empty for a brain without callouts.
 */
export function calloutQuestions(spec: BrainSpec): Record<string, ChoiceQuestion> {
    return Object.fromEntries(
        calloutSources(spec).map(({ question, callouts }) => [question, calloutQuestion(spec, question, callouts)]),
    );
}

function calloutQuestion(spec: BrainSpec, question: string, callouts: Callouts): ChoiceQuestion {
    const criteria: Record<string, string> = {};
    for (const [option, callout] of Object.entries(callouts)) {
        criteria[option] =
            `say "${callout.say}"${callout.fill ? ' (the values are filled in from your console)' : ''}: ${callout.when}`;
    }
    criteria[SILENCE] = SILENCE_CRITERION;
    return {
        type: 'choice',
        instructions:
            spec.controls[question]?.instructions ??
            'You are the `role`, speaking to the rest of the crew on the ship radio. `heard` is what they said lately. Do you call something out right now?',
        criteria,
    };
}

/**
 * What a callout answer puts on the air: its phrase, with `{name}` placeholders filled from the
 * speaker's display by the callout's `fill`. Undefined for silence, an unknown option, or a fill the
 * display cannot supply.
 */
export function calloutSaid(
    spec: BrainSpec,
    choice: string,
    display: Display,
    question = CALLOUT_QUESTION,
    /** What the speaker's display showed at its previous decision. */
    previous?: Display,
    /** Values the speaking seat supplies itself, for a fill that needs them (`salvoTally`). */
    supplied?: FillValues,
): Said | undefined {
    const source = calloutSources(spec).find((s) => s.question === question);
    const callout = choice === SILENCE ? undefined : source?.callouts[choice];
    if (!callout) {
        return undefined;
    }
    const seat = source?.seat === undefined ? {} : { seat: source.seat };
    if (!callout.fill) {
        return { callout: choice, phrase: callout.say, ...seat };
    }
    const values = calloutFills[callout.fill](display, previous, spec.decisionSeconds, supplied);
    return (
        values && {
            callout: choice,
            phrase: callout.say.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m),
            values,
            ...seat,
        }
    );
}

type ShownAlly = { name: string; distance: number };

/** The targeting panel's check-fire line: the ally at risk and where, or undefined while the line is clear. */
export function checkFireOf(panels: Display['panels']) {
    const t = panels['targeting-status'] as
        { allyInLine?: ShownAlly | null; allyNearTarget?: ShownAlly | null } | undefined;
    if (t?.allyInLine) return { ally: t.allyInLine, where: 'in the line of fire' };
    if (t?.allyNearTarget) return { ally: t.allyNearTarget, where: 'by the target' };
    return undefined;
}
