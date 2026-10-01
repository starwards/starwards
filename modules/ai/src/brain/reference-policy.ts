import { Answer, Policy } from './brain';

import { Control } from './controls';

type XY = { x: number; y: number };
type Contact = { id: string; distance: number; bearing: number; position: XY; scanLevel?: string; type?: string };
type Radar = { ownShip?: { heading?: number; position?: XY }; contacts?: Contact[] };
type Display = { panels: Record<string, Record<string, unknown> | undefined>; radar?: Radar };
type Helms = { rotationMode?: number; maneuveringMode?: number; maneuveringCommand?: Partial<XY> };

/** Smart-pilot mode numbers as `helms-stats` shows them. */
const VELOCITY = 1;
const TARGET = 2;

/** Gun-on-target tolerance and the range the chain gun's fuse can reach (gravitas: 8000 m). */
const FIRE_ARC_DEGREES = 2;
const FIRE_RANGE_METERS = 8000;
/**
 * Where the pilot parks: this far straight behind the target's motion. Space caps a shell's speed at
 * its muzzle speed, so a shell chasing a receding target detonates short by ~a quarter of the range,
 * and a blast keeps only a third of its shell's speed, so one fired at an oncoming target is swept
 * off it at once; close behind, the shortfall stays inside the blast.
 */
const STANDOFF_METERS = 500;
/** How fast (per second) the pilot closes the gap to its parking spot, and the cap on that speed. */
const PARKING_GAIN = 0.3;
const MAX_PARKING_SPEED = 200;
/** Below this the target counts as still, and the pilot parks on the current line of sight instead. */
const STILL_SPEED = 50;
/** The ship's top speed (gravitas): the maneuvering command is a fraction of it. */
const MAX_SPEED = 450;
/** Beyond this past the standoff the pilot burns afterburner: blasts fling a dead target at our top speed. */
const PURSUIT_METERS = 1500;

/**
 * Hand-written rules that press the same buttons a brain does, for helms and weapons. It is the
 * positive control of the harness: it shows a kill is reachable through the button interface, so
 * a brain that fails is failing at judgement, not at the interface. Other stations rest. Each seat
 * gets its own instance: helms remembers the last radar fix to tell the target's velocity.
 */
export function makeReferencePolicy(decisionSeconds: number): Policy {
    let lastFix: { id: string; position: XY } | undefined;
    let targetVelocity: XY = { x: 0, y: 0 };
    return {
        name: 'reference',
        answer(_request, controls, shown) {
            const display = shown as Display;
            const ship = nearestShip(display);
            if (ship && lastFix?.id === ship.id) {
                targetVelocity = scale(sub(ship.position, lastFix.position), 1 / decisionSeconds);
            }
            lastFix = ship && { id: ship.id, position: ship.position };
            const answers: Record<string, Answer> = {};
            for (const control of controls) {
                const choice = referenceChoice(control, display, ship, targetVelocity) ?? control.rest;
                answers[control.id] = { choice, source: 'rule' };
            }
            return Promise.resolve({ answers });
        },
    };
}

function referenceChoice(control: Control, display: Display, ship: Contact | undefined, targetVelocity: XY) {
    const heading = display.radar?.ownShip?.heading ?? 0;
    const helms = display.panels['helms-stats'] as Helms | undefined;
    const targeting = display.panels['targeting-status'];
    const aligned = ship && Math.abs(delta(ship.bearing, heading)) < 15;
    const [command] = control.id.split(':');
    switch (command) {
        case 'target':
            return targeting?.targetId ? 'none' : 'next';
        case 'fireChainGun': {
            const target = display.radar?.contacts?.find((c) => c.id === targeting?.targetId);
            return target &&
                Math.abs(delta(target.bearing, heading)) <= FIRE_ARC_DEGREES &&
                target.distance <= FIRE_RANGE_METERS
                ? 'fire'
                : 'hold_fire';
        }
        case 'rotationMode':
            // the target mode is refused until weapons holds a lock, which needs a scanned contact
            return helms && helms.rotationMode !== TARGET && ship && ship.scanLevel !== 'UFO' ? 'press' : 'wait';
        case 'maneuveringMode':
            // matching the target's velocity needs the same lock, which shows as the rotation lock holding
            return helms && helms.rotationMode === TARGET && helms.maneuveringMode !== TARGET ? 'press' : 'wait';
        case 'rotation': {
            if (!helms || helms.rotationMode === TARGET || !ship) {
                return 'centre';
            }
            const off = delta(ship.bearing, heading);
            return Math.abs(off) < 5 ? 'centre' : off > 0 ? 'right' : 'left';
        }
        case 'boost':
        case 'strafe': {
            const wanted = helms && ship ? parkingCommand(display, helms, ship, targetVelocity, heading) : undefined;
            const axis = command === 'boost' ? 'x' : 'y';
            const current = Number(helms?.maneuveringCommand?.[axis] ?? 0);
            const goal = wanted ? wanted[axis] : 0;
            const [up, down] = command === 'boost' ? ['forward', 'back'] : ['right', 'left'];
            return current < goal - 0.025 ? up : current > goal + 0.025 ? down : 'hold';
        }
        case 'afterBurner':
            return aligned && ship.distance > STANDOFF_METERS + PURSUIT_METERS ? 'engage' : 'release';
        default:
            return undefined;
    }
}

/**
 * The maneuvering command (ship frame, fractions of top speed) that moves the ship toward its parking
 * spot. In the target mode the command is on top of the target's own velocity; otherwise it carries it.
 */
function parkingCommand(display: Display, helms: Helms, ship: Contact, targetVelocity: XY, heading: number) {
    const own = display.radar?.ownShip?.position ?? { x: 0, y: 0 };
    const fromTarget = sub(own, ship.position);
    const speed = length(targetVelocity);
    const behind = speed > STILL_SPEED ? scale(targetVelocity, -1 / speed) : scale(fromTarget, 1 / ship.distance);
    const gap = sub(scale(behind, STANDOFF_METERS), fromTarget);
    const closing = scale(gap, PARKING_GAIN);
    const capped = scale(closing, Math.min(1, MAX_PARKING_SPEED / Math.max(length(closing), 1)));
    const world = helms.maneuveringMode === VELOCITY ? add(capped, targetVelocity) : capped;
    const rad = (-heading * Math.PI) / 180;
    return {
        x: clamp((world.x * Math.cos(rad) - world.y * Math.sin(rad)) / MAX_SPEED),
        y: clamp((world.x * Math.sin(rad) + world.y * Math.cos(rad)) / MAX_SPEED),
    };
}

/** The nearest contact that is a ship, not a shell or a blast. */
function nearestShip(display: Display) {
    const ships = (display.radar?.contacts ?? []).filter((c) => c.type === undefined || c.type === 'Spaceship');
    return ships.sort((a, b) => a.distance - b.distance)[0];
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
