import { referenceKnobs } from './reference-knobs';
import { RepairProtocolStats, repairProtocols } from '@starwards/core/internal';

/** The panels of a station's display, as the reference reads them. */
type Panels = { panels: Record<string, Record<string, unknown> | undefined> };

/**
 * How the reference engineer varies, for validating an engineer score against known-better and
 * known-worse play: `jumpStart` jump-starts a dry reactor, `repair` queues the repair protocol for a
 * defect the damage report shows: on the reactor only, on any system, or on any system with the
 * magazine's capacity first (shells are the ship's one lasting weapon, and a docked ship restocks only to its capacity);
 * `magazine-retry` also queues it again after the reactor ran short of energy and cancelled it part-way;
 * `magazine-first` retries too, and in its windows ({@link magazineFirstWindow}) cancels another repair
 * to run the magazine's first.
 */
export type EngineerStyle = {
    jumpStart: boolean;
    repair: 'none' | 'reactor' | 'all' | 'magazine' | 'magazine-retry' | 'magazine-first';
};
type RepairScope = Exclude<EngineerStyle['repair'], 'none'>;

export const REFERENCE_ENGINEER: EngineerStyle = { jumpStart: true, repair: 'reactor' };

export type SystemStatus = { pointer: string; power: number; coolantFactor: number; heat: number };
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
/**
 * Once the ship has been hit (a plate gone or a defect reported) the tubes run at normal power while
 * the store holds more than this share, so weapons can load missiles; out of a fight they stay shut.
 */
const TUBE_STORE = 0.5;
/** The reactor bursts to full power only while cooler than this. */
const REACTOR_BURST_HEAT = 50;
/** Below this share of the store, with a cell left, the engineer jump-starts the reactor. */
const JUMP_START_STORE = 0.1;
/** The refusal a repair shows after the reactor ran short of energy and cancelled it: it can be queued again. */
const CANCELLED_FOR_ENERGY = /was cancelled: insufficient reactor energy/;
/** The repairing engineer queues a repair only while the store holds more than this share. */
/**
 * The chain gun drops to low power at this heat and returns to normal once below the release heat,
 * as the NPC automation backs off its guns: low power halves the rate of fire and quarters the heat
 * per second, so a gun held at the heat limit fires more shells at low power than at normal.
 */
const SHUTDOWN = 0;
const LOW = 0.25;
const NORMAL = 0.5;
const MAX = 1;

/**
 * The engineer of the wave-defence harness, through the console: warp and docking shut
 * down; the reactor at normal power, bursting to full while the store is low and it is still cool;
 * tubes at normal power once the ship has been hit or the captain has ordered an attack, and while
 * the store holds half; thrusters at low power while the store is low, and shut down while it is
 * lower still and the reactor is damaged; the chain gun at low power while hot; coolant shared in
 * proportion to each system's heat; a reactor jump-start when the store runs dry; and, one at a time,
 * a field repair for a reactor defect the damage report shows (a repairing engineer, for any system's
 * defect).
 */
export function engineerChoice(
    command: string,
    key: string,
    display: Panels,
    style: EngineerStyle,
    ordered: boolean,
    now = 0,
) {
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
        if (style.repair === 'none') return 'none';
        if (style.repair === 'magazine-first' && magazineFirstWindow(now) && repairToCancel(display, slots) === key) {
            return 'lower';
        }
        return store > referenceKnobs.REPAIR_STORE && repairToQueue(display, slots, style.repair) === key
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
    const goal = powerGoal(key, system, store, reactorDamaged, ordered || engaged(display, defects));
    return goal === undefined ? 'hold' : towards(system.power, goal, 0.01);
}

/**
 * The first idle field repair, in catalogue order, that fixes a defect the damage report shows -- none
 * while another repair is queued or running. With a `magazine*` scope, the one that fixes the magazine's
 * capacity comes first.
 */
function repairToQueue(display: Panels, slots: readonly RepairSlot[], scope: RepairScope) {
    if (slots.some((s) => s.priority !== 'OFF')) {
        return undefined;
    }
    const fixes = repairFixes(display, scope !== 'reactor' && scope !== 'all' && scope !== 'magazine');
    if (scope !== 'reactor' && scope !== 'all') {
        const first = slots.find((slot) => fixes(slot, 'magazine'));
        if (first) return first.protocolId;
    }
    return slots.find((slot) => fixes(slot, scope === 'reactor' ? 'reactor' : undefined))?.protocolId;
}

/**
 * `magazine-first`: from `MAGAZINE_FIRST_SECONDS` (wave 1 over) for `MAGAZINE_FIRST_WINDOW_SECONDS`, and
 * from `MAGAZINE_FIRST_PRE_DOCK_SECONDS` before a restock-window dock (`RESTOCK_FROM_SECONDS`) until it.
 */
function magazineFirstWindow(now: number) {
    const k = referenceKnobs;
    const afterWave1 =
        now >= k.MAGAZINE_FIRST_SECONDS && now < k.MAGAZINE_FIRST_SECONDS + k.MAGAZINE_FIRST_WINDOW_SECONDS;
    const preDock =
        k.RESTOCK_FROM_SECONDS > 0 &&
        now >= k.RESTOCK_FROM_SECONDS - k.MAGAZINE_FIRST_PRE_DOCK_SECONDS &&
        now < k.RESTOCK_FROM_SECONDS;
    return afterWave1 || preDock;
}

/** The queued or running repair (not the magazine's, nor a jump-start) to cancel while an idle one fixes a shown magazine defect. */
function repairToCancel(display: Panels, slots: readonly RepairSlot[]) {
    const fixes = repairFixes(display, true);
    if (!slots.some((slot) => fixes(slot, 'magazine'))) return undefined;
    const catalogue: Record<string, RepairProtocolStats | undefined> = repairProtocols;
    return slots.find(
        (s) =>
            s.priority !== 'OFF' &&
            s.priority !== 'CANCELLING' &&
            s.protocolId !== 'reactorJumpStart' &&
            !catalogue[s.protocolId]?.targets.some((t) => t.system === 'magazine'),
    )?.protocolId;
}

/** Whether an idle field repair fixes a defect the damage report shows (on `only`'s system, if given). */
function repairFixes(display: Panels, retry: boolean) {
    const defects = (display.panels['damage-report'] ?? []) as unknown as Defect[];
    const catalogue: Record<string, RepairProtocolStats | undefined> = repairProtocols;
    return (slot: RepairSlot, only?: string) => {
        const protocol = catalogue[slot.protocolId];
        return (
            slot.priority === 'OFF' &&
            (!slot.refusalReason || (retry && CANCELLED_FOR_ENERGY.test(slot.refusalReason))) &&
            protocol?.tier === 'field' &&
            protocol.targets.some(
                (t) =>
                    (only === undefined || t.system === only) &&
                    defects.some((d) => systemKey(d.system) === t.system && d.field === t.field),
            )
        );
    };
}

/** `/chainGuns/0` -> `chainGuns`. */
function systemKey(pointer: string) {
    return pointer.split('/')[1];
}

function powerGoal(pointer: string, system: SystemStatus, store: number, reactorDamaged: boolean, inFight: boolean) {
    if (pointer.startsWith('/tubes/')) {
        return inFight && store > TUBE_STORE ? NORMAL : SHUTDOWN;
    }
    if (pointer === '/warp' || pointer === '/docking') {
        return SHUTDOWN;
    }
    if (pointer === '/reactor') {
        return store < LOW_STORE && system.heat < REACTOR_BURST_HEAT ? MAX : NORMAL;
    }
    if (pointer.startsWith('/chainGuns/')) {
        return system.heat >= referenceKnobs.GUN_BACKOFF_HEAT
            ? LOW
            : system.heat < referenceKnobs.GUN_RELEASE_HEAT
              ? NORMAL
              : undefined;
    }
    if (pointer.startsWith('/thrusters/')) {
        if (reactorDamaged && store < THRUSTER_SHUTDOWN_STORE) return SHUTDOWN;
        if (reactorDamaged && store < THRUSTER_RESTART_STORE) return undefined;
        return store < LOW_STORE ? LOW : store > HIGH_STORE ? NORMAL : undefined;
    }
    return undefined;
}

/** Whether the ship is in a fight, as the engineer can tell: it has lost a plate or carries a defect. */
function engaged(display: Panels, defects: readonly Defect[]) {
    const armor = display.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    return defects.length > 0 || (armor !== undefined && (armor.healthyPlates ?? 0) < (armor.numberOfPlates ?? 0));
}

/** One key press from `current` toward `goal` on an axis, or `hold` within `tolerance` of it. */
function towards(current: number, goal: number, tolerance: number) {
    return current < goal - tolerance ? 'raise' : current > goal + tolerance ? 'lower' : 'hold';
}
