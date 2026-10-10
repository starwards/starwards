import { Answer, Policy } from './brain';
import { RepairProtocolStats, repairProtocols } from '@starwards/core/internal';

import { Control } from './controls';

type XY = { x: number; y: number };
type Contact = {
    id: string;
    distance: number;
    bearing: number;
    position: XY;
    scanLevel?: string;
    type?: string;
    radius?: number;
};
type Radar = {
    ownShip?: { heading?: number; position?: XY };
    contacts?: Contact[];
    /** Bearing relative to the nose, degrees. */
    scanBeam?: { bearing: number; arc: number } | null;
};
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
 * How the reference engineer varies, for validating an engineer score against known-better and
 * known-worse play: `jumpStart` jump-starts a dry reactor, `repair` queues the repair protocol for a
 * defect the damage report shows: on the reactor only, or on any system.
 */
export type EngineerStyle = { jumpStart: boolean; repair: 'none' | 'reactor' | 'all' };

const REFERENCE_ENGINEER: EngineerStyle = { jumpStart: true, repair: 'reactor' };

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
 * Each seat gets its own instance: helms remembers the last radar fix to tell the target's
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
    return {
        name,
        answer(_request, controls, shown) {
            const display = shown as Display;
            const ship = nearestShip(display);
            if (ship && lastFix?.id === ship.id) {
                targetVelocity = scale(sub(ship.position, lastFix.position), 1 / decisionSeconds);
            }
            lastFix = ship && { id: ship.id, position: ship.position };
            seconds += decisionSeconds;
            armed ||= underFire(display);
            const standoff = armed ? helms.armedStandoff : helms.standoff;
            const weaveMeters = armed ? helms.weaveMeters : 0;
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
                    ) ?? control.rest;
                answers[control.id] = { choice, source: 'rule' };
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
) {
    const { standoff } = parking;
    const heading = display.radar?.ownShip?.heading ?? 0;
    const helms = display.panels['helms-stats'] as Helms | undefined;
    const targeting = display.panels['targeting-status'];
    const aligned = ship && Math.abs(delta(ship.bearing, heading)) < 15;
    const [command] = control.id.split(':');
    switch (command) {
        case 'target': {
            // an unscanned blip may be a shell: cycle past anything too small to be a ship
            const locked = display.radar?.contacts?.find((c) => c.id === targeting?.targetId);
            return !targeting?.targetId || (locked && !isShip(locked)) ? 'next' : 'none';
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
        case 'rotationMode':
            // the target mode is refused until weapons holds a lock; weapons' radar reaches twice as far
            // as helms', so keep pressing while helms shows nothing: a refused press changes nothing
            return helms && helms.rotationMode !== TARGET && (!ship || ship.scanLevel !== 'UFO') ? 'press' : 'wait';
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
            const wanted =
                helms &&
                (ship
                    ? parkingCommand(display, helms, ship, targetVelocity, heading, seconds, parking)
                    : closeIn(helms));
            const axis = command === 'boost' ? 'x' : 'y';
            const current = Number(helms?.maneuveringCommand?.[axis] ?? 0);
            const goal = wanted ? wanted[axis] : 0;
            const [up, down] = command === 'boost' ? ['forward', 'back'] : ['right', 'left'];
            return current < goal - 0.025 ? up : current > goal + 0.025 ? down : 'hold';
        }
        case 'afterBurner':
            // a target flung at our top speed is never closed on without the afterburner
            return aligned &&
                (ship.distance > standoff + PURSUIT_METERS ||
                    (ship.distance > standoff && length(targetVelocity) > FLUNG_SPEED))
                ? 'engage'
                : 'release';
        case 'beamDirection':
            return beamChoice(display);
        case 'systemPower':
        case 'systemCoolant':
        case 'cycleRepairPriority':
            return engineerChoice(command, control.id.slice(command.length + 1), display, engineer);
        default:
            return undefined;
    }
}

type SystemStatus = { pointer: string; power: number; coolantFactor: number; heat: number };
type Engineering = { energy: number; maxEnergy: number; energyCells: number };
type RepairSlot = { protocolId: string; priority: string; refusalReason?: string };
type Defect = { system: string; field: string };

/** Below this share of the energy store the thrusters drop to low power and the reactor bursts. */
const LOW_STORE = 0.75;
/** Above this share the thrusters go back to normal power. */
const HIGH_STORE = 0.9;
/**
 * With the damage report showing a reactor defect, below this share of the store the thrusters shut
 * down, and stay down until it climbs past {@link THRUSTER_RESTART_STORE}: they draw most of the
 * ship's energy, and with the reactor shot to pieces the store left goes to the gun and to repairs.
 * A sound reactor refills the store, so a ship that only starts short keeps flying.
 */
const THRUSTER_SHUTDOWN_STORE = 0.4;
const THRUSTER_RESTART_STORE = 0.5;
/** The reactor bursts to full power only while cooler than this. */
const REACTOR_BURST_HEAT = 50;
/** Below this share of the store, with a cell left, the engineer jump-starts the reactor. */
const JUMP_START_STORE = 0.1;
/** The repairing engineer queues a repair only while the store holds more than this share. */
const REPAIR_STORE = 0.3;
/**
 * The chain gun drops to low power at this heat and returns to normal once below the release heat,
 * as the NPC automation backs off its guns: low power halves the rate of fire and quarters the heat
 * per second, so a gun held at the heat limit fires more shells at low power than at normal.
 */
const GUN_BACKOFF_HEAT = 60;
const GUN_RELEASE_HEAT = 40;
const SHUTDOWN = 0;
const LOW = 0.25;
const NORMAL = 0.5;
const MAX = 1;

/**
 * The engineer of the wave-defence harness, through the console: warp, docking and tubes shut
 * down; the reactor at normal power, bursting to full while the store is low and it is still cool;
 * thrusters at low power while the store is low, and shut down while it is lower still and the
 * reactor is damaged; the chain gun at low power while hot; coolant shared in proportion to each
 * system's heat; a reactor jump-start when the store runs dry; and, one at a time, a field repair for
 * a reactor defect the damage report shows (a repairing engineer, for any system's defect).
 */
function engineerChoice(command: string, key: string, display: Display, style: EngineerStyle) {
    const systems = (display.panels['full-systems-status'] ?? []) as unknown as SystemStatus[];
    const engineering = display.panels['engineering-status'] as Engineering | undefined;
    if (!engineering) {
        return undefined;
    }
    const store = engineering.energy / engineering.maxEnergy;
    if (command === 'cycleRepairPriority') {
        const slots = (display.panels['repair-queue'] as { slots?: RepairSlot[] } | undefined)?.slots ?? [];
        const slot = slots.find((s) => s.protocolId === key);
        if (key === 'reactorJumpStart') {
            return style.jumpStart &&
                slot?.priority === 'OFF' &&
                store < JUMP_START_STORE &&
                engineering.energyCells > 0
                ? 'raise'
                : 'none';
        }
        return style.repair !== 'none' && store > REPAIR_STORE && repairToQueue(display, slots, style.repair) === key
            ? 'raise'
            : 'none';
    }
    const system = systems.find((s) => s.pointer === key);
    if (!system) {
        return undefined;
    }
    if (command === 'systemCoolant') {
        const hottest = Math.max(...systems.map((s) => s.heat));
        return towards(system.coolantFactor, hottest > 0 ? system.heat / hottest : 0, 0.05);
    }
    const defects = (display.panels['damage-report'] ?? []) as unknown as Defect[];
    const reactorDamaged = defects.some((d) => systemKey(d.system) === 'reactor');
    const goal = powerGoal(key, system, store, reactorDamaged);
    return goal === undefined ? 'hold' : towards(system.power, goal, 0.01);
}

/**
 * The first idle field repair, in catalogue order, that fixes a defect the damage report shows -- none
 * while another repair is queued or running.
 */
function repairToQueue(display: Display, slots: readonly RepairSlot[], scope: 'reactor' | 'all') {
    if (slots.some((s) => s.priority !== 'OFF')) {
        return undefined;
    }
    const defects = (display.panels['damage-report'] ?? []) as unknown as Defect[];
    const catalogue: Record<string, RepairProtocolStats | undefined> = repairProtocols;
    return slots.find((slot) => {
        const protocol = catalogue[slot.protocolId];
        return (
            slot.priority === 'OFF' &&
            !slot.refusalReason &&
            protocol?.tier === 'field' &&
            protocol.targets.some((t) =>
                defects.some(
                    (d) =>
                        systemKey(d.system) === t.system &&
                        d.field === t.field &&
                        (scope === 'all' || t.system === scope),
                ),
            )
        );
    })?.protocolId;
}

/** `/chainGuns/0` -> `chainGuns`. */
function systemKey(pointer: string) {
    return pointer.split('/')[1];
}

function powerGoal(pointer: string, system: SystemStatus, store: number, reactorDamaged: boolean) {
    if (pointer === '/warp' || pointer === '/docking' || pointer.startsWith('/tubes/')) {
        return SHUTDOWN;
    }
    if (pointer === '/reactor') {
        return store < LOW_STORE && system.heat < REACTOR_BURST_HEAT ? MAX : NORMAL;
    }
    if (pointer.startsWith('/chainGuns/')) {
        return system.heat >= GUN_BACKOFF_HEAT ? LOW : system.heat < GUN_RELEASE_HEAT ? NORMAL : undefined;
    }
    if (pointer.startsWith('/thrusters/')) {
        if (reactorDamaged && store < THRUSTER_SHUTDOWN_STORE) return SHUTDOWN;
        if (reactorDamaged && store < THRUSTER_RESTART_STORE) return undefined;
        return store < LOW_STORE ? LOW : store > HIGH_STORE ? NORMAL : undefined;
    }
    return undefined;
}

/** One key press from `current` toward `goal` on an axis, or `hold` within `tolerance` of it. */
function towards(current: number, goal: number, tolerance: number) {
    return current < goal - tolerance ? 'raise' : current > goal + tolerance ? 'lower' : 'hold';
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
    const world = helms.maneuveringMode === VELOCITY ? add(capped, targetVelocity) : capped;
    const rad = (-heading * Math.PI) / 180;
    return {
        x: clamp((world.x * Math.cos(rad) - world.y * Math.sin(rad)) / MAX_SPEED),
        y: clamp((world.x * Math.sin(rad) + world.y * Math.cos(rad)) / MAX_SPEED),
    };
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
        .filter((c) => isShip(c) && c.scanLevel !== 'FULL')
        .sort((a, b) => a.distance - b.distance)[0];
    if (!beam || !next) return 'hold';
    const off = delta(delta(next.bearing, heading), beam.bearing);
    return Math.abs(off) <= BEAM_SLACK_DEGREES ? 'hold' : off > 0 ? 'right' : 'left';
}

/** The nearest contact that is a ship. */
function nearestShip(display: Display) {
    return (display.radar?.contacts ?? []).filter(isShip).sort((a, b) => a.distance - b.distance)[0];
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
