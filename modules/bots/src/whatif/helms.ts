import { Contact, Radar, offNose } from '../brain/verbal';
import { SmartPilotMode, XY } from '@starwards/core/internal';
import { WhatIf, WhatIfContext } from './whatif';

/**
 * What the pilot knows of the GVTS without any display: its top speed, what the afterburner adds to
 * it, and its fastest commanded turn. A command key sets a fraction of these.
 */
const MAX_SPEED = 450;
const AFTERBURNER_SPEED = 600;
const MAX_TURN_SPEED = 108;

/** The firing position: this far behind the contact's motion (or from a still contact, on any side). */
const TAIL_METERS = 500;
/** Within this of the firing position counts as there. */
const ARRIVED_METERS = 150;
/** A contact slower than this has no tail: any point at the firing distance will do. */
const STILL_SPEED = 20;
/** Blips smaller than this are shells, not ships (as the verbal reading tells them apart). */
const SHELL_SIZED_METERS = 5;

/** How far ahead the predicted position is read out, how far the arrival is looked for, and the step. */
const POSITION_SECONDS = 4;
const NOSE_SECONDS = 3;
const ARRIVAL_SECONDS = 30;
const STEP_SECONDS = 0.25;

type HelmsStats = {
    rotationMode?: SmartPilotMode;
    maneuveringMode?: SmartPilotMode;
    rotationCommand?: number;
    maneuveringCommand?: { x?: number; y?: number };
    afterBurner?: number;
    turnSpeed?: number;
};
type HelmsRadar = Omit<Radar, 'ownShip'> & { ownShip?: { heading: number; position?: XY } };

/** Everything the rough flight needs, all of it read off the helms display. */
type Flight = {
    own: XY;
    heading: number;
    contact: XY;
    contactVelocity: XY;
    rotationMode: SmartPilotMode;
    maneuveringMode: SmartPilotMode;
    /** Turn rate command, boost and strafe as fractions, afterburner 0 or 1: the keys' settings. */
    rotation: number;
    boost: number;
    strafe: number;
    afterBurner: number;
    turnSpeed: number;
};

/** The contact helms flies on: the nearest ship or unidentified ship-sized blip on its own radar. */
function trackedContact(radar: HelmsRadar | undefined): Contact | undefined {
    return (radar?.contacts ?? [])
        .filter(
            (c) =>
                c.type === 'Spaceship' ||
                (c.type === undefined && !(c.radius !== undefined && c.radius < SHELL_SIZED_METERS)),
        )
        .sort((a, b) => a.distance - b.distance)[0];
}

/**
 * The flight as the display shows it: the tracked contact's velocity is its change of position since
 * the previous display, the same derivation the verbal radar reading uses. Nothing without a radar
 * fix on both displays.
 */
function readFlight({ display, previous, secondsSincePrevious }: WhatIfContext): Flight | undefined {
    const radar = display.radar as HelmsRadar | undefined;
    const stats = display.panels['helms-stats'] as HelmsStats | undefined;
    const contact = trackedContact(radar);
    const before = (previous?.radar as HelmsRadar | undefined)?.contacts?.find((c) => c.id === contact?.id);
    if (!stats || !radar?.ownShip?.position || !contact?.position || !before?.position) {
        return undefined;
    }
    return {
        own: radar.ownShip.position,
        heading: radar.ownShip.heading,
        contact: contact.position,
        contactVelocity: XY.scale(XY.difference(contact.position, before.position), 1 / secondsSincePrevious),
        rotationMode: stats.rotationMode ?? SmartPilotMode.DIRECT,
        maneuveringMode: stats.maneuveringMode ?? SmartPilotMode.DIRECT,
        rotation: stats.rotationCommand ?? 0,
        boost: stats.maneuveringCommand?.x ?? 0,
        strafe: stats.maneuveringCommand?.y ?? 0,
        afterBurner: stats.afterBurner ?? 0,
        turnSpeed: stats.turnSpeed ?? 0,
    };
}

/** The flight with one key's setting replaced by what the option would set it to. */
function withOption(flight: Flight, { control, option }: WhatIfContext): Flight | undefined {
    const value = control.press(option)?.value;
    const set = typeof value === 'number' ? value : undefined;
    switch (control.command) {
        case 'boost':
            return { ...flight, boost: set ?? flight.boost };
        case 'strafe':
            return { ...flight, strafe: set ?? flight.strafe };
        case 'afterBurner':
            return { ...flight, afterBurner: option === 'engage' ? 1 : option === 'release' ? 0 : flight.afterBurner };
        case 'rotation':
            return { ...flight, rotation: set ?? flight.rotation };
        default:
            return undefined;
    }
}

type Moment = { seconds: number; range: number; off: number; gap: number };

/**
 * Flies the ship forward with the keys held as they are. The smart pilot reaches a commanded speed
 * or turn rate well inside one step, so the commanded value is taken as the actual one: in
 * maneuvering TARGET the ship moves at the command on top of the contact's velocity, in VELOCITY at
 * the command itself; in rotation TARGET the nose stays on the contact (assumed to be the weapons
 * target, which helms cannot see), in VELOCITY it turns at the commanded rate.
 */
function* fly(start: Flight): Generator<Moment> {
    let { own, heading, contact } = start;
    const speed = XY.lengthOf(start.contactVelocity);
    const maxSpeed = MAX_SPEED + start.afterBurner * AFTERBURNER_SPEED;
    const command = XY.scale({ x: start.boost, y: start.strafe }, maxSpeed);
    for (let seconds = STEP_SECONDS; seconds <= ARRIVAL_SECONDS + 1e-9; seconds += STEP_SECONDS) {
        if (start.rotationMode === SmartPilotMode.TARGET) {
            heading = XY.angleOf(XY.difference(contact, own));
        } else if (start.rotationMode === SmartPilotMode.VELOCITY) {
            heading += start.rotation * MAX_TURN_SPEED * STEP_SECONDS;
        } else {
            heading += start.turnSpeed * STEP_SECONDS;
        }
        const thrust = XY.rotate(command, heading);
        const velocity =
            start.maneuveringMode === SmartPilotMode.TARGET ? XY.add(start.contactVelocity, thrust) : thrust;
        own = XY.add(own, XY.scale(velocity, STEP_SECONDS));
        contact = XY.add(contact, XY.scale(start.contactVelocity, STEP_SECONDS));
        const sight = XY.difference(contact, own);
        const range = XY.lengthOf(sight);
        const gap =
            speed > STILL_SPEED
                ? XY.lengthOf(
                      XY.difference(XY.add(contact, XY.scale(start.contactVelocity, -TAIL_METERS / speed)), own),
                  )
                : Math.abs(range - TAIL_METERS);
        yield { seconds, range, off: offNose(XY.angleOf(sight), heading), gap };
    }
}

const side = (off: number) =>
    Math.abs(off) < 1 ? 'dead on the nose' : `${Math.abs(off).toFixed(0)}° ${off > 0 ? 'right' : 'left'} of the nose`;

/**
 * Helms boost, strafe and afterburner: where the tracked contact will be in 4 s with this key, how
 * far the ship will then be from the firing position 500 m behind the contact's motion, and when it
 * gets there. Indicator: the nearer the firing position in 4 s, the better. Nothing in maneuvering
 * mode DIRECT, where the keys fire raw thrust.
 */
export const tailGeometry: WhatIf = (context) => {
    const shown = readFlight(context);
    const flight = shown && withOption(shown, context);
    if (!flight || flight.maneuveringMode === SmartPilotMode.DIRECT || context.control.command === 'rotation') {
        return undefined;
    }
    let at: Moment | undefined;
    let arrival: number | undefined;
    for (const moment of fly(flight)) {
        if (Math.abs(moment.seconds - POSITION_SECONDS) < 1e-9) at = moment;
        if (arrival === undefined && moment.gap <= ARRIVED_METERS) arrival = moment.seconds;
    }
    if (!at) {
        return undefined;
    }
    const reached =
        arrival === undefined ? `not reached within ${ARRIVAL_SECONDS} s` : `reached in ${Math.ceil(arrival)} s`;
    return {
        phrase: `In ${POSITION_SECONDS} s: contact ${at.range.toFixed(0)} m away, ${side(at.off)}, firing position ${at.gap.toFixed(0)} m off (${reached}).`,
        value: -Math.round(at.gap),
    };
};

/**
 * Helms rotation keys: how far off the nose the tracked contact will be in 3 s at the turn rate this
 * key sets. Indicator: the nearer the nose, the better. Nothing in rotation mode TARGET (the nose
 * follows the target by itself) or DIRECT.
 */
export const noseOnContact: WhatIf = (context) => {
    const shown = readFlight(context);
    const flight = shown && withOption(shown, context);
    if (!flight || flight.rotationMode !== SmartPilotMode.VELOCITY || context.control.command !== 'rotation') {
        return undefined;
    }
    for (const moment of fly(flight)) {
        if (Math.abs(moment.seconds - NOSE_SECONDS) < 1e-9) {
            return {
                phrase: `In ${NOSE_SECONDS} s: contact ${side(moment.off)}.`,
                value: -Math.round(Math.abs(moment.off)),
            };
        }
    }
    return undefined;
};
