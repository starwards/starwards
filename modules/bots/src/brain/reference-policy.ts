import { referenceKnobs } from './reference-knobs';
import { Answer, Policy } from './brain';
import { EngineerStyle, REFERENCE_ENGINEER, SystemStatus, engineerChoice } from './reference-engineer';
import { Resupply, SalvoTally, calloutMemory, referenceCallout } from './reference-orders';
import { Contact as ShownContact, Radar as ShownRadar } from './verbal';
import { closingSpeed, inLaunchEnvelope, launchRange } from './engagement';
import { flightSeconds, stillFlying } from './salvo';

import { CALLOUT_QUESTION } from './callout';
import { Control } from './controls';
import { captainOrdersFromBoard } from '../crew/orders';

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

/** The range the chain gun's fuse can reach (gravitas: 8000 m). */
const GUN_REACH_METERS = 8000;

/**
 * A homing missile turns hard after launch, so a tube fires at anything up to a little past its beam
 * line: a side tube still fires at a target on the nose.
 */
const TUBE_ARC_DEGREES = 100;
/** One missile at a time, this far apart: a salvo spends the magazine on a target the first hits already fling. */
/**
 * Where the pilot parks: this far straight behind the target's motion. Space caps a shell's speed at
 * its muzzle speed, so a shell chasing a receding target detonates short by ~a quarter of the range,
 * and a blast keeps only a third of its shell's speed, so one fired at an oncoming target is swept
 * off it at once; close behind, the shortfall stays inside the blast.
 */
/**
 * Where the pilot parks once the target has shot armor off the GVTS: beyond the reach of a fighter's
 * slow shells' lead -- they fly half as fast as ours -- yet inside our gun's 8 km. Close in, the
 * fighter strips the armor and breaks the reactor faster than our gun kills it.
 */
/**
 * A lateral weave across the parking spot, as the NPC attack weave flies it: a parked ship is a
 * still target for a gun whose shells take seconds to arrive.
 */
/** How fast (per second) the pilot closes the gap to its parking spot, and the cap on that speed. */
const MAX_PARKING_SPEED = 200;
/** Below this the target counts as still, and the pilot parks on the current line of sight instead. */
const STILL_SPEED = 50;
/** The ship's top speed (gravitas): the maneuvering command is a fraction of it. */
const MAX_SPEED = 450;
/** Beyond this past the standoff the pilot burns afterburner: blasts fling a dead target at our top speed. */
/** The captain's close order leads the ship away from the nearest enemy only to a spot this far off: near, they fight it out together. */
const LEAVE_NEAREST_METERS = 10_000;
/** A target this fast was flung by our blasts and runs away at our top speed. */
const FLUNG_SPEED = 0.9 * MAX_SPEED;

/**
 * Helms with `clearLine`: an allied station whose hull comes this near the gun line from the parking
 * spot through the target fouls it (weapons calls check fire), so the pilot parks across the target from it.
 */
/** How fast helms with `clearLine` steps across a fouled gun line. */
const SIDESTEP_SPEED = MAX_PARKING_SPEED;
/** A contact this wide is a station, not a ship. */
const STATION_RADIUS_METERS = 200;

/**
 * How the reference helms varies, for validating a helms score against known-better and known-worse
 * play: where it parks (`standoff` before the target has fired, `armedStandoff` after), and the
 * lateral weave it flies across the parking spot once it has been fired on.
 */
export type HelmsStyle = {
    standoff: number;
    armedStandoff: number;
    weaveMeters: number;
    clearLine?: boolean;
    /** Park on the enemy the captain's engage or focus order names while it is in sight, not on the nearest. */
    parkOnEngaged?: boolean;
};

export const REFERENCE_HELMS: HelmsStyle = {
    get standoff() {
        return referenceKnobs.STANDOFF_METERS;
    },
    get armedStandoff() {
        return referenceKnobs.ARMED_STANDOFF_METERS;
    },
    get weaveMeters() {
        return referenceKnobs.WEAVE_METERS;
    },
};

/**
 * Hand-written rules that press the same buttons a brain does, for helms, weapons and engineer. It
 * is the positive control of the harness: it shows a kill is reachable through the button
 * interface, so a brain that fails is failing at judgement, not at the interface. Signals rests.
 * Weapons also launches a missile from a loaded tube that bears on its lock, one every
 * {@link referenceKnobs.LAUNCH_INTERVAL_SECONDS}. Each seat gets its own instance: helms remembers the last radar fix to tell the target's
 * velocity, and whether the target has fired back.
 */
export function makeReferencePolicy(
    decisionSeconds: number,
    engineer: EngineerStyle = REFERENCE_ENGINEER,
    name = 'reference',
    helms: HelmsStyle = REFERENCE_HELMS,
    shellPreference?: readonly string[],
    fireRangeMeters = Infinity,
    resupply?: Resupply,
    threatTarget = false,
    guardCentre = false,
): Policy {
    let lastFix: { id: string; position: XY } | undefined;
    let targetVelocity: XY = { x: 0, y: 0 };
    let seconds = 0;
    let armed = false;
    let lastLaunch = -Infinity;
    let previous: Display | undefined;
    const talk = calloutMemory(resupply, threatTarget, guardCentre);
    /** Weapons' own count of its launches at the locked ship: when each is due to arrive. */
    let salvo: { targetId: string; arrivals: number[] } | undefined;
    const spend: Spend = { lockId: undefined, firedOn: 0, firstShells: undefined };
    return {
        name,
        answer(request, controls, shown, heard) {
            const display = shown as Display;
            const orders = captainOrdersFromBoard(display, previous);
            const ship = (helms.parkOnEngaged && engagedShip(display, orders.engage)) || nearestShip(display);
            if (ship && lastFix?.id === ship.id) {
                targetVelocity = scale(sub(ship.position, lastFix.position), 1 / decisionSeconds);
            }
            lastFix = ship && { id: ship.id, position: ship.position };
            seconds += decisionSeconds;
            armed ||= underFire(display);
            const standoff = armed ? helms.armedStandoff : helms.standoff;
            const weaveMeters = armed ? helms.weaveMeters : 0;
            // a salvo order holds the tubes while its missiles fly
            const salvoFull =
                orders.salvo !== undefined &&
                salvo !== undefined &&
                stillFlying(salvo.arrivals, seconds) >= orders.salvo;
            const launchTube =
                seconds - lastLaunch >= referenceKnobs.LAUNCH_INTERVAL_SECONDS && !salvoFull && !checkFire(display)
                    ? tubeToLaunch(display, previous, decisionSeconds, seconds)
                    : undefined;
            const answers: Record<string, Answer> = {};
            const lockId = display.panels['targeting-status']?.targetId as string | undefined;
            if (lockId !== spend.lockId) spend.firedOn = 0;
            spend.lockId = lockId;
            spend.firstShells ??= shellsLeft(display);
            let launched: SalvoTally | undefined;
            for (const control of controls) {
                const choice =
                    referenceChoice(
                        control,
                        display,
                        ship,
                        targetVelocity,
                        seconds,
                        { standoff, weaveMeters, clearLine: helms.clearLine === true },
                        engineer,
                        launchTube,
                        orders,
                        shellPreference,
                        fireRangeMeters,
                        spend,
                    ) ?? control.rest;
                answers[control.id] = { choice, source: 'rule' };
                if (control.command === 'fireChainGun' && choice === 'fire') spend.firedOn += decisionSeconds;
                if (control.command === 'fireTube' && choice === 'fire') {
                    lastLaunch = seconds;
                    salvo = countLaunch(salvo, display, previous, decisionSeconds, seconds);
                    launched = salvo && tally(salvo, seconds);
                }
            }
            const callout = referenceCallout(request, display, previous, decisionSeconds, orders.engage, {
                heard,
                state: talk,
                salvo: launched,
                salvoOrdered: orders.salvo !== undefined,
                focusOrdered: orders.focus === true,
                focusStation: orders.focusStation,
                checkFireOrdered: orders.checkFire === true,
                dockOrdered: orders.dock === true,
            });
            previous = display;
            if (callout) {
                answers[CALLOUT_QUESTION] = callout;
            }
            return Promise.resolve({ answers });
        },
    };
}

/** Adds a launch at the locked ship to the count, which restarts when the lock moves to another ship. */
function countLaunch(
    salvo: { targetId: string; arrivals: number[] } | undefined,
    display: Display,
    previous: Display | undefined,
    decisionSeconds: number,
    now: number,
) {
    const targetId = display.panels['targeting-status']?.targetId as string | undefined;
    const target = display.radar?.contacts?.find((c) => c.id === targetId);
    if (!targetId || !target) {
        return salvo;
    }
    const closing = closingSpeed(
        target as unknown as ShownContact,
        display.radar as ShownRadar | undefined,
        previous?.radar as ShownRadar | undefined,
        decisionSeconds,
    );
    const flight = flightSeconds(target.distance, closing);
    const arrivals = salvo?.targetId === targetId ? salvo.arrivals : [];
    return { targetId, arrivals: [...arrivals, now + flight] };
}

/** Launches at the locked ship so far, and those still flying at `now`. */
function tally(salvo: { arrivals: number[] }, now: number): SalvoTally {
    return { n: salvo.arrivals.length, inFlight: stillFlying(salvo.arrivals, now) };
}

/** Where the helms parks now, how wide it weaves across the spot, and whether it keeps allied stations off the gun line. */
type Parking = { standoff: number; weaveMeters: number; clearLine?: boolean };

function referenceChoice(
    control: Control,
    display: Display,
    nearest: Contact | undefined,
    targetVelocity: XY,
    seconds: number,
    parking: Parking,
    engineer: EngineerStyle,
    launchTube: number | undefined,
    orders: ReturnType<typeof captainOrdersFromBoard>,
    shellPreference: readonly string[] | undefined,
    fireRangeMeters: number,
    spend: Spend,
) {
    const { standoff } = parking;
    const heading = display.radar?.ownShip?.heading ?? 0;
    const helms = display.panels['helms-stats'] as Helms | undefined;
    const targeting = display.panels['targeting-status'];
    // the captain ordering the ship to close on another, distant enemy than the nearest (one attacking
    // a station, not a straggler alongside) flies the ship there instead of parking on the nearest
    const own = display.radar?.ownShip?.position ?? { x: 0, y: 0 };
    const ship =
        orders.helm?.kind === 'close' &&
        orders.helm.target !== undefined &&
        nearest?.name !== orders.helm.target &&
        length(sub(orders.helm.spot, own)) > LEAVE_NEAREST_METERS
            ? undefined
            : nearest;
    const aligned = ship && Math.abs(delta(ship.bearing, heading)) < 15;
    // with no enemy on the helms radar, the captain's last order flies the ship
    const order = ship ? undefined : orders.helm;
    const [command] = control.id.split(':');
    switch (command) {
        case 'target': {
            // an unscanned blip may be a shell, an identified ally is no target, and the captain names the enemy to engage
            const locked = display.radar?.contacts?.find((c) => c.id === targeting?.targetId);
            const finishing =
                referenceKnobs.FINISH_LOCK_SECONDS > 0 &&
                spend.firedOn >= referenceKnobs.FINISH_LOCK_SECONDS &&
                locked !== undefined &&
                locked.distance <= Math.min(fireRangeMeters, referenceKnobs.FIRE_RANGE_METERS);
            return !targeting?.targetId ||
                (locked &&
                    (!isShip(locked) ||
                        isAlly(locked, display) ||
                        (orders.engage !== undefined && locked.name !== orders.engage && !finishing)))
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
                !checkFire(display) &&
                Math.abs(delta(target.bearing, heading)) <= referenceKnobs.FIRE_ARC_DEGREES &&
                target.distance <= Math.min(fireRangeMeters, GUN_REACH_METERS) &&
                (nearStation(display, target) ||
                    (target.distance <= referenceKnobs.FIRE_RANGE_METERS && withinBudget(display, seconds, spend)))
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
            return (aligned &&
                (ship.distance > standoff + referenceKnobs.PURSUIT_METERS ||
                    (ship.distance > standoff && length(targetVelocity) > FLUNG_SPEED))) ||
                (order?.kind === 'close' &&
                    length(sub(order.spot, own)) > referenceKnobs.PURSUIT_METERS &&
                    Math.abs(delta(bearingTo(display, order.spot), heading)) < 15)
                ? 'engage'
                : 'release';
        }
        case 'changeGunAmmo': {
            // cycle on until the gun takes the first preferred shell type with stock; without a preference
            // (or none of them stocked), once the loaded type ran dry while another has stock
            const guns = (display.panels['gun-status'] ?? []) as unknown as { index: number; projectile: string }[];
            const stock = (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)
                ?.ammo;
            const gun = guns.find((g) => g.index === Number(control.id.split(':')[1] ?? 0));
            if (!gun || !stock) return 'wait';
            const left = (type: string) => stock[type]?.count ?? 0;
            const preference =
                shellPreference ?? (seconds < referenceKnobs.FRAG_FIRST_SECONDS ? FRAG_FIRST : undefined);
            const wanted = preference?.find((t) => left(t) > 0);
            if (wanted) return gun.projectile === wanted ? 'wait' : 'press';
            const others = Object.keys(stock).some((t) => t.endsWith('Shell') && t !== gun.projectile && left(t) > 0);
            return left(gun.projectile) < 1 && others ? 'press' : 'wait';
        }
        case 'changeTubeAmmo': {
            if (referenceKnobs.TUBE_AMMO_FALLBACK <= 0.5) return undefined;
            // cycle an empty, unloaded tube on to the first missile type in TUBE_AMMO_ORDER with stock
            const tubes = (display.panels['tubes-status'] ?? []) as unknown as (TubeStatus & { projectile: string })[];
            const stock = (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)
                ?.ammo;
            const tube = tubes.find((t) => t.index === Number(control.id.split(':')[1] ?? 0));
            if (!tube || !stock || tube.loading > 0) return 'wait';
            const left = (type: string) => stock[type]?.count ?? 0;
            if (left(tube.projectile) >= 1) return 'wait';
            const wanted = TUBE_AMMO_ORDER.find((t) => left(t) >= 1);
            return wanted && tube.projectile !== wanted ? 'press' : 'wait';
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
    { standoff, weaveMeters, clearLine }: Parking,
) {
    const own = display.radar?.ownShip?.position ?? { x: 0, y: 0 };
    const fromTarget = sub(own, ship.position);
    const speed = length(targetVelocity);
    const straight = speed > STILL_SPEED ? scale(targetVelocity, -1 / speed) : scale(fromTarget, 1 / ship.distance);
    const behind = clearLine ? clearOfStations(display, ship, straight, standoff, fromTarget) : straight;
    const across = { x: -behind.y, y: behind.x };
    const phase = 2 * Math.PI * referenceKnobs.WEAVE_HZ * seconds;
    const spot = add(scale(behind, standoff), scale(across, weaveMeters * Math.sin(phase)));
    const gap = sub(spot, fromTarget);
    const weave = scale(across, weaveMeters * 2 * Math.PI * referenceKnobs.WEAVE_HZ * Math.cos(phase));
    const parking = add(scale(gap, referenceKnobs.PARKING_GAIN), weave);
    const step = clearLine ? sidestep(display, ship) : undefined;
    // a fouled line: keep only the range-keeping part of the parking, and step across the line
    const closing = step ? add(scale(step.fire, dot(parking, step.fire)), step.across) : parking;
    const capped = scale(closing, Math.min(1, MAX_PARKING_SPEED / Math.max(length(closing), 1)));
    return shipFrame(helms.maneuveringMode === VELOCITY ? add(capped, targetVelocity) : capped, heading);
}

/**
 * The side of `ship` to park on so the gun line from there through it misses every allied station:
 * `behind` when it already does, else square to the first station that fouls it, on the side nearer
 * the own ship.
 */
function clearOfStations(display: Display, ship: Contact, behind: XY, standoff: number, fromTarget: XY) {
    const fire = scale(behind, -1);
    for (const station of display.radar?.contacts ?? []) {
        if (!isAlly(station, display) || (station.radius ?? 0) < STATION_RADIUS_METERS) continue;
        const rel = sub(station.position, ship.position);
        const along = rel.x * fire.x + rel.y * fire.y;
        const across = Math.abs(rel.x * fire.y - rel.y * fire.x);
        if (
            along < -standoff ||
            along > GUN_REACH_METERS ||
            across > (station.radius ?? 0) + referenceKnobs.LINE_CLEARANCE_METERS
        ) {
            continue;
        }
        const gap = Math.max(length(rel), 1);
        const square = { x: -rel.y / gap, y: rel.x / gap };
        return square.x * fromTarget.x + square.y * fromTarget.y >= 0 ? square : scale(square, -1);
    }
    return behind;
}

const XY_ZERO = { x: 0, y: 0 };

/**
 * The velocity that swings the gun line from where the ship is now off the first allied station it fouls:
 * square to the line, toward the station's side when it lies past the target (the line beyond pivots
 * away from it) and away from it when it lies between.
 */
function sidestep(display: Display, ship: Contact) {
    const own = display.radar?.ownShip?.position ?? XY_ZERO;
    const line = sub(ship.position, own);
    const fire = scale(line, 1 / Math.max(length(line), 1));
    for (const station of display.radar?.contacts ?? []) {
        if (!isAlly(station, display) || (station.radius ?? 0) < STATION_RADIUS_METERS) continue;
        const rel = sub(station.position, own);
        const along = rel.x * fire.x + rel.y * fire.y;
        const side = fire.x * rel.y - fire.y * rel.x;
        const clearance = (station.radius ?? 0) + referenceKnobs.LINE_CLEARANCE_METERS;
        if (along <= 0 || along > GUN_REACH_METERS + clearance || Math.abs(side) > clearance) continue;
        const toward = side >= 0 ? { x: -fire.y, y: fire.x } : { x: fire.y, y: -fire.x };
        return { fire, across: scale(toward, along > length(line) ? SIDESTEP_SPEED : -SIDESTEP_SPEED) };
    }
    return undefined;
}

const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;

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
    const closing = scale(gap, referenceKnobs.PARKING_GAIN);
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

type TubeStatus = { index: number; loadedProjectile: string; loading: number; bearing: number };

/**
 * The first loaded tube that bears on the locked ship, while that ship is inside its missile's launch
 * envelope for how the ship moves since the `previous` decision `seconds` ago; none without a lock.
 */
function tubeToLaunch(display: Display, previous: Display | undefined, seconds: number, now: number) {
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
            inEnvelope(t.loadedProjectile) &&
            !reserved(display, t.loadedProjectile, now),
    )?.index;
}

/** Whether launching `missile` now would dig into the missile reserve (`MISSILE_RESERVE`). */
function reserved(display: Display, missile: string, now: number) {
    if (referenceKnobs.MISSILE_RESERVE <= 0 || now >= referenceKnobs.MISSILE_RESERVE_SECONDS) return false;
    const ammo = (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo;
    // the loaded round is already out of the magazine: launching it leaves the magazine's count
    return (ammo?.[missile]?.count ?? Infinity) < referenceKnobs.MISSILE_RESERVE;
}

/** Missile types an empty tube falls back to, best first (`TUBE_AMMO_FALLBACK`). */
const TUBE_AMMO_ORDER = ['HiExpMissile', 'ArmPenMissile', 'FragMissile'];

/** The shell order while the gun spends Frag first, saving HE and AP. */
const FRAG_FIRST = ['FragShell', 'HiExpShell', 'ArmPenShell'];

/** Weapons' own shell accounting: the lock, seconds fired at it, and the HE and AP shells it first saw. */
type Spend = { lockId: string | undefined; firedOn: number; firstShells: number | undefined };

/** HE and AP shells the ammo panel shows, if it shows any. */
function shellsLeft(display: Display) {
    const ammo = (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo;
    return ammo && (ammo.HiExpShell?.count ?? 0) + (ammo.ArmPenShell?.count ?? 0);
}

/** Whether weapons spent no more than `WAVE_SHELL_BUDGET` of its first-seen shells, or the budget expired. */
function withinBudget(display: Display, now: number, spend: Spend) {
    if (now >= referenceKnobs.SHELL_BUDGET_SECONDS || spend.firstShells === undefined) return true;
    return spend.firstShells - (shellsLeft(display) ?? 0) <= referenceKnobs.WAVE_SHELL_BUDGET * spend.firstShells;
}

/** Whether `target` is within `STATION_GUARD_METERS` of an allied station. */
function nearStation(display: Display, target: Contact) {
    const guard = referenceKnobs.STATION_GUARD_METERS;
    if (guard <= 0 || !target.position) return false;
    return (display.radar?.contacts ?? []).some(
        (c) =>
            isAlly(c, display) &&
            (c.radius ?? 0) >= STATION_RADIUS_METERS &&
            c.position !== undefined &&
            length(sub(c.position, target.position)) <= guard,
    );
}

/** Whether the targeting panel calls check fire: an ally in the line of fire or inside the blast at the lock. */
function checkFire(display: Display) {
    const shown = display.panels['targeting-status'] as { allyInLine?: unknown; allyNearTarget?: unknown } | undefined;
    return Boolean(shown?.allyInLine || shown?.allyNearTarget);
}

/** Whether the weapons console shows the chain gun too hot to fire without damaging itself. */
function gunTooHot(display: Display) {
    const systems = (display.panels['systems-status'] ?? []) as unknown as SystemStatus[];
    return systems.some(
        (s) => s.pointer.startsWith('/chainGuns/') && s.heat > referenceKnobs.GUN_HOLD_HEAT && s.coolantFactor > 0,
    );
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
 * reference leaves the queue order to the signals automation.
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

/** The enemy ship named `name` (the captain's engage or focus pick), if it is in sight. */
function engagedShip(display: Display, name: string | undefined) {
    return name === undefined
        ? undefined
        : (display.radar?.contacts ?? []).find((c) => c.name === name && isShip(c) && !isAlly(c, display));
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
