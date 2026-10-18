import { Answer, Policy } from './brain';
import { CaptainOrders, captainOrders, referenceCallout } from './reference-orders';
import { EngineerStyle, REFERENCE_ENGINEER, SystemStatus, engineerChoice } from './reference-engineer';
import { Contact as ShownContact, Radar as ShownRadar } from './verbal';
import { inLaunchEnvelope, launchRange, nearestEnemy } from './engagement';

import { CALLOUT_QUESTION } from './callout';
import { Control } from './controls';

type XY = { x: number; y: number };
type Contact = {
    id: string;
    name?: string;
    distance: number;
    bearing: number;
    position: XY;
    scanLevel?: string;
    type?: string;
    faction?: number;
    radius?: number;
};
type Radar = {
    ownShip?: { heading?: number; position?: XY; faction?: number };
    contacts?: Contact[];
    /** Bearing relative to the nose, degrees. */
    scanBeam?: { bearing: number; arc: number } | null;
};
type Display = { panels: Record<string, Record<string, unknown> | undefined>; radar?: Radar };
type Helms = {
    rotationMode?: number;
    targetLocked?: boolean;
    maneuveringMode?: number;
    maneuveringCommand?: Partial<XY>;
};

/** Smart-pilot mode numbers as `helms-stats` shows them. */
const VELOCITY = 1;
const TARGET = 2;

/** Gun-on-target tolerance and the range the chain gun's fuse can reach (gravitas: 8000 m). */
const FIRE_ARC_DEGREES = 2;
const FIRE_RANGE_METERS = 8000;
/**
 * A homing missile turns hard after launch, so a tube fires at anything up to a little past its beam
 * line: a side tube still fires at a target on the nose.
 */
const TUBE_ARC_DEGREES = 100;
/** One missile at a time, this far apart: a salvo spends the magazine on a target the first hits already fling. */
const LAUNCH_INTERVAL_SECONDS = 10;
/**
 * Where the pilot parks: this far straight behind the target's motion. Space caps a shell's speed at
 * its muzzle speed, so a shell chasing a receding target detonates short by ~a quarter of the range,
 * and a blast keeps only a third of its shell's speed, so one fired at an oncoming target is swept
 * off it at once; close behind, the shortfall stays inside the blast.
 */
const STANDOFF_METERS = 500;
/**
 * Where the pilot parks once the target has shot armor off the GVTS: beyond the reach of a fighter's
 * slow shells' lead -- they fly half as fast as ours -- yet inside our gun's 8 km. Close in, the
 * fighter strips the armor and breaks the reactor faster than our gun kills it.
 */
const ARMED_STANDOFF_METERS = 4000;
/**
 * A lateral weave across the parking spot, as the NPC attack weave flies it: a parked ship is a
 * still target for a gun whose shells take seconds to arrive.
 */
const WEAVE_METERS = 400;
const WEAVE_HZ = 0.08;
/** How fast (per second) the pilot closes the gap to its parking spot, and the cap on that speed. */
const PARKING_GAIN = 0.3;
const MAX_PARKING_SPEED = 200;
/** Below this the target counts as still, and the pilot parks on the current line of sight instead. */
const STILL_SPEED = 50;
/** The ship's top speed (gravitas): the maneuvering command is a fraction of it. */
const MAX_SPEED = 450;
/** Beyond this past the standoff the pilot burns afterburner: blasts fling a dead target at our top speed. */
const PURSUIT_METERS = 1500;
/** A target this fast was flung by our blasts and runs away at our top speed. */
const FLUNG_SPEED = 0.9 * MAX_SPEED;

/**
 * How the reference helms varies, for validating a helms score against known-better and known-worse
 * play: where it parks (`standoff` before the target has fired, `armedStandoff` after), and the
 * lateral weave it flies across the parking spot once it has been fired on.
 */
export type HelmsStyle = { standoff: number; armedStandoff: number; weaveMeters: number };

const REFERENCE_HELMS: HelmsStyle = {
    standoff: STANDOFF_METERS,
    armedStandoff: ARMED_STANDOFF_METERS,
    weaveMeters: WEAVE_METERS,
};

/**
 * Hand-written rules that press the same buttons a brain does, for helms, weapons and engineer. It
 * is the positive control of the harness: it shows a kill is reachable through the button
 * interface, so a brain that fails is failing at judgement, not at the interface. Signals rests.
 * Weapons also launches a missile from a loaded tube that bears on its lock, one every
 * {@link LAUNCH_INTERVAL_SECONDS}. Each seat gets its own instance: helms remembers the last radar fix to tell the target's
 * velocity, and whether the target has fired back.
 */
export function makeReferencePolicy(
    decisionSeconds: number,
    engineer: EngineerStyle = REFERENCE_ENGINEER,
    name = 'reference',
    helms: HelmsStyle = REFERENCE_HELMS,
): Policy {
    let lastFix: { id: string; position: XY } | undefined;
    let targetVelocity: XY = { x: 0, y: 0 };
    let seconds = 0;
    let armed = false;
    let lastLaunch = -Infinity;
    let previous: Display | undefined;
    /** The enemy this seat (as captain) last ordered engaged: local until the shared order state lands. */
    let engaged: string | undefined;
    const orders = captainOrders();
    return {
        name,
        answer(request, controls, shown, heard) {
            const display = shown as Display;
            const ship = nearestShip(display);
            if (ship && lastFix?.id === ship.id) {
                targetVelocity = scale(sub(ship.position, lastFix.position), 1 / decisionSeconds);
            }
            lastFix = ship && { id: ship.id, position: ship.position };
            seconds += decisionSeconds;
            orders.hear(heard, seconds, display.radar?.ownShip?.position);
            armed ||= underFire(display);
            const standoff = armed ? helms.armedStandoff : helms.standoff;
            const weaveMeters = armed ? helms.weaveMeters : 0;
            const launchTube =
                seconds - lastLaunch >= LAUNCH_INTERVAL_SECONDS
                    ? tubeToLaunch(display, previous, decisionSeconds)
                    : undefined;
            const answers: Record<string, Answer> = {};
            for (const control of controls) {
                const choice =
                    referenceChoice(
                        control,
                        display,
                        ship,
                        targetVelocity,
                        seconds,
                        { standoff, weaveMeters },
                        engineer,
                        launchTube,
                        orders,
                    ) ?? control.rest;
                answers[control.id] = { choice, source: 'rule' };
                if (control.command === 'fireTube' && choice === 'fire') {
                    lastLaunch = seconds;
                }
            }
            const callout = referenceCallout(request, shown, previous, decisionSeconds, engaged);
            if (callout?.choice === 'engage') {
                engaged = nearestEnemy(shown.radar as ShownRadar | undefined)?.name;
            }
            previous = display;
            if (callout) {
                answers[CALLOUT_QUESTION] = callout;
            }
            return Promise.resolve({ answers });
        },
    };
}

/** Where the helms parks now, and how wide it weaves across the spot. */
type Parking = { standoff: number; weaveMeters: number };

function referenceChoice(
    control: Control,
    display: Display,
    ship: Contact | undefined,
    targetVelocity: XY,
    seconds: number,
    parking: Parking,
    engineer: EngineerStyle,
    launchTube: number | undefined,
    orders: CaptainOrders,
) {
    const { standoff } = parking;
    const heading = display.radar?.ownShip?.heading ?? 0;
    const helms = display.panels['helms-stats'] as Helms | undefined;
    const targeting = display.panels['targeting-status'];
    const aligned = ship && Math.abs(delta(ship.bearing, heading)) < 15;
    // with no enemy on the helms radar, the captain's last order flies the ship
    const order = ship ? undefined : orders.helm;
    const [command] = control.id.split(':');
    switch (command) {
        case 'target': {
            // an unscanned blip may be a shell, an identified ally is no target, and the captain names the enemy to engage
            const locked = display.radar?.contacts?.find((c) => c.id === targeting?.targetId);
            return !targeting?.targetId ||
                (locked &&
                    (!isShip(locked) ||
                        isAlly(locked, display) ||
                        (orders.engage !== undefined && locked.name !== orders.engage)))
                ? 'next'
                : 'none';
        }
        case 'targetEnemyOnly':
            // the enemy-only filter waits on Signals' scan: while no ship is identified it lets no lock through
            return (display.radar?.contacts ?? []).some((c) => isShip(c) && c.scanLevel !== 'UFO') ? 'on' : 'off';
        case 'fireChainGun': {
            const target = display.radar?.contacts?.find((c) => c.id === targeting?.targetId);
            return target &&
                !gunTooHot(display) &&
                Math.abs(delta(target.bearing, heading)) <= FIRE_ARC_DEGREES &&
                target.distance <= FIRE_RANGE_METERS
                ? 'fire'
                : 'hold_fire';
        }
        case 'tubeSafety':
            // released only to launch; the tube locks again before the next decision's launch check
            return launchTube !== undefined && control.id === `tubeSafety:${launchTube}` ? 'off' : 'on';
        case 'fireTube':
            return launchTube !== undefined && control.id === `fireTube:${launchTube}` ? 'fire' : 'hold_fire';
        case 'rotationMode':
            // the target mode is refused until weapons holds a lock, and helms sees the lock (the line to
            // the target), so press only then: a press without a lock just cycles the mode back
            return helms && helms.targetLocked && helms.rotationMode !== TARGET ? 'press' : 'wait';
        case 'maneuveringMode':
            // matching the target's velocity needs the same lock, which shows as the rotation lock holding
            return helms && helms.rotationMode === TARGET && helms.maneuveringMode !== TARGET ? 'press' : 'wait';
        case 'rotation': {
            const aim = ship?.bearing ?? (order?.kind === 'close' ? bearingTo(display, order.spot) : undefined);
            if (!helms || helms.rotationMode === TARGET || aim === undefined) {
                return 'centre';
            }
            const off = delta(aim, heading);
            return Math.abs(off) < 5 ? 'centre' : off > 0 ? 'right' : 'left';
        }
        case 'antiDrift':
            // nothing to fly to or after: stop the ship drifting
            return helms && !ship && (order?.kind === 'hold' || (!order && helms.rotationMode !== TARGET))
                ? 'engage'
                : 'release';
        case 'boost':
        case 'strafe': {
            const wanted =
                helms &&
                (ship
                    ? parkingCommand(display, helms, ship, targetVelocity, heading, seconds, parking)
                    : order
                      ? order.kind === 'close' && flyTo(display, order.spot, heading)
                      : closeIn(helms));
            const axis = command === 'boost' ? 'x' : 'y';
            const current = Number(helms?.maneuveringCommand?.[axis] ?? 0);
            const goal = wanted ? wanted[axis] : 0;
            const [up, down] = command === 'boost' ? ['forward', 'back'] : ['right', 'left'];
            return current < goal - 0.025 ? up : current > goal + 0.025 ? down : 'hold';
        }
        case 'afterBurner': {
            // a target flung at our top speed is never closed on without the afterburner, nor one the captain orders us after
            const own = display.radar?.ownShip?.position ?? { x: 0, y: 0 };
            return (aligned &&
                (ship.distance > standoff + PURSUIT_METERS ||
                    (ship.distance > standoff && length(targetVelocity) > FLUNG_SPEED))) ||
                (order?.kind === 'close' &&
                    length(sub(order.spot, own)) > PURSUIT_METERS &&
                    Math.abs(delta(bearingTo(display, order.spot), heading)) < 15)
                ? 'engage'
                : 'release';
        }
        case 'beamDirection':
            return beamChoice(display);
        case 'systemPower':
        case 'systemCoolant':
        case 'cycleRepairPriority':
            return engineerChoice(
                command,
                control.id.slice(command.length + 1),
                display,
                engineer,
                orders.helm?.kind === 'close' || orders.engage !== undefined,
            );
        default:
            return undefined;
    }
}

/**
 * Whether the target fights back: unidentified specks on the radar are its shells (ours show
 * identified), and lost armor plates are its hits.
 */
function underFire(display: Display) {
    const armor = display.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    const shells = (display.radar?.contacts ?? []).some((c) => c.scanLevel === 'UFO' && !isShip(c));
    return shells || (armor !== undefined && (armor.healthyPlates ?? 0) < (armor.numberOfPlates ?? 0));
}

/**
 * The maneuvering command (ship frame, fractions of top speed) that moves the ship toward its parking
 * spot. In the target mode the command is on top of the target's own velocity; otherwise it carries it.
 */
function parkingCommand(
    display: Display,
    helms: Helms,
    ship: Contact,
    targetVelocity: XY,
    heading: number,
    seconds: number,
    { standoff, weaveMeters }: Parking,
) {
    const own = display.radar?.ownShip?.position ?? { x: 0, y: 0 };
    const fromTarget = sub(own, ship.position);
    const speed = length(targetVelocity);
    const behind = speed > STILL_SPEED ? scale(targetVelocity, -1 / speed) : scale(fromTarget, 1 / ship.distance);
    const across = { x: -behind.y, y: behind.x };
    const phase = 2 * Math.PI * WEAVE_HZ * seconds;
    const spot = add(scale(behind, standoff), scale(across, weaveMeters * Math.sin(phase)));
    const gap = sub(spot, fromTarget);
    const weave = scale(across, weaveMeters * 2 * Math.PI * WEAVE_HZ * Math.cos(phase));
    const closing = add(scale(gap, PARKING_GAIN), weave);
    const capped = scale(closing, Math.min(1, MAX_PARKING_SPEED / Math.max(length(closing), 1)));
    return shipFrame(helms.maneuveringMode === VELOCITY ? add(capped, targetVelocity) : capped, heading);
}

/** A world velocity as a maneuvering command: ship frame, fractions of top speed. */
function shipFrame(world: XY, heading: number) {
    const rad = (-heading * Math.PI) / 180;
    return {
        x: clamp((world.x * Math.cos(rad) - world.y * Math.sin(rad)) / MAX_SPEED),
        y: clamp((world.x * Math.sin(rad) + world.y * Math.cos(rad)) / MAX_SPEED),
    };
}

/** The fastest the pilot flies to a point the captain ordered: a long run, not a parking manoeuvre. */
const ORDERED_SPEED = 0.9 * MAX_SPEED;

/** The maneuvering command that flies the ship to the world point `spot`, slowing as it nears it. */
function flyTo(display: Display, spot: XY, heading: number) {
    const gap = sub(spot, display.radar?.ownShip?.position ?? { x: 0, y: 0 });
    const closing = scale(gap, PARKING_GAIN);
    return shipFrame(scale(closing, Math.min(1, ORDERED_SPEED / Math.max(length(closing), 1))), heading);
}

/** World bearing from the own ship to the world point `spot`, degrees. */
function bearingTo(display: Display, spot: XY) {
    const gap = sub(spot, display.radar?.ownShip?.position ?? { x: 0, y: 0 });
    return (Math.atan2(gap.y, gap.x) * 180) / Math.PI;
}

/**
 * With the rotation locked on a target beyond the helms radar, the nose points at it: fly forward
 * until it shows on the radar and parking takes over.
 */
function closeIn(helms: Helms) {
    return helms.rotationMode === TARGET ? { x: MAX_PARKING_SPEED / MAX_SPEED, y: 0 } : undefined;
}

/**
 * Above this heat the gun's next burst overheats it, and every overheat breaks some of its rate of
 * fire. Holding pays only while coolant flows to the gun: uncooled, it never cools down.
 */
const GUN_HOLD_HEAT = 85;

type TubeStatus = { index: number; loadedProjectile: string; loading: number; bearing: number };

/**
 * The first loaded tube that bears on the locked ship, while that ship is inside its missile's launch
 * envelope for how the ship moves since the `previous` decision `seconds` ago; none without a lock.
 */
function tubeToLaunch(display: Display, previous: Display | undefined, seconds: number) {
    const targetId = display.panels['targeting-status']?.targetId;
    const target = display.radar?.contacts?.find((c) => c.id === targetId);
    if (!target || !isShip(target)) {
        return undefined;
    }
    const shown = target as unknown as ShownContact;
    const radar = display.radar as ShownRadar | undefined;
    const inEnvelope = (ammo: string) =>
        inLaunchEnvelope(
            target.distance,
            launchRange(shown, radar, previous?.radar as ShownRadar | undefined, seconds, ammo),
        );
    const relative = delta(target.bearing, display.radar?.ownShip?.heading ?? 0);
    const tubes = (display.panels['tubes-status'] ?? []) as unknown as TubeStatus[];
    return tubes.find(
        (t) =>
            t.loading >= 1 &&
            Math.abs(delta(relative, t.bearing)) <= TUBE_ARC_DEGREES &&
            inEnvelope(t.loadedProjectile),
    )?.index;
}

/** Whether the weapons console shows the chain gun too hot to fire without damaging itself. */
function gunTooHot(display: Display) {
    const systems = (display.panels['systems-status'] ?? []) as unknown as SystemStatus[];
    return systems.some((s) => s.pointer.startsWith('/chainGuns/') && s.heat > GUN_HOLD_HEAT && s.coolantFactor > 0);
}

/** A blip this wide or wider is a hull; shells and blasts show as specks. */
const SHIP_RADIUS_METERS = 5;

/** A ship, or an unscanned blip the size of one -- not a shell or a blast. */
function isShip(contact: Contact) {
    return contact.type === 'Spaceship' || (contact.type === undefined && (contact.radius ?? 0) >= SHIP_RADIUS_METERS);
}

/** Degrees the beam may sit off its contact before signals steers it. */
const BEAM_SLACK_DEGREES = 5;

/**
 * Signals steers the scan beam onto the most threatening ship it has not scanned to FULL: the nearest,
 * since every hostile here closes to fight. Deep scans past BASIC need the beam on the contact. The
 * queue order is not the reference's to set while the brain cannot address a job (#2308).
 */
function beamChoice(display: Display) {
    const beam = display.radar?.scanBeam;
    const heading = display.radar?.ownShip?.heading ?? 0;
    const next = (display.radar?.contacts ?? [])
        .filter((c) => isShip(c) && !isAlly(c, display) && c.scanLevel !== 'FULL')
        .sort((a, b) => a.distance - b.distance)[0];
    if (!beam || !next) return 'hold';
    const off = delta(delta(next.bearing, heading), beam.bearing);
    return Math.abs(off) <= BEAM_SLACK_DEGREES ? 'hold' : off > 0 ? 'right' : 'left';
}

/** A contact identified as the own faction's. */
function isAlly(contact: Contact, display: Display) {
    const own = display.radar?.ownShip?.faction;
    return own !== undefined && contact.faction === own;
}

/** The nearest contact that is a ship and not an identified ally. */
function nearestShip(display: Display) {
    return (display.radar?.contacts ?? [])
        .filter((c) => isShip(c) && !isAlly(c, display))
        .sort((a, b) => a.distance - b.distance)[0];
}

/** Signed difference between two bearings, in (-180, 180]. */
function delta(bearing: number, heading: number) {
    return ((((bearing - heading) % 360) + 540) % 360) - 180;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const add = (a: XY, b: XY) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: XY, b: XY) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: XY, f: number) => ({ x: a.x * f, y: a.y * f });
const length = (a: XY) => Math.hypot(a.x, a.y);
