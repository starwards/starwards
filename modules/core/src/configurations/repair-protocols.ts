import { SystemState, getSystems } from '../ship/system';
import { ShipState } from '../ship/ship-state';

/**
 * Ship-design-agnostic tier gate: a protocol above the ship's current repair
 * tier is refused at enqueue time (SPEC-0003 §done-conditions). Only `field`
 * content is in scope for this build slice.
 */
export type RepairProtocolTier = 'field' | 'docked' | 'shipyard';

/**
 * Top-level ShipState field a repair-protocol target lives on. Mirrors the
 * keys `getSystems()` reports (the first path segment of a system pointer,
 * e.g. `/thrusters/0` -> `thrusters`, `/chainGun` -> `chainGun`).
 */
export type RepairableSystemKey =
    | 'thrusters'
    | 'tubes'
    | 'chainGun'
    | 'radars'
    | 'reactor'
    | 'smartPilot'
    | 'magazine'
    | 'warp'
    | 'docking'
    | 'maneuvering'
    | 'signals';

export type RepairProtocolTarget = {
    system: RepairableSystemKey;
    field: string;
};

export type RepairProtocolStats = {
    name: string;
    /** Defectible fields this protocol clears on completion. Cross-cutting by design (SPEC-0003). */
    targets: RepairProtocolTarget[];
    /** Seconds the operation stays active. */
    duration: number;
    /** Energy drawn per second while active. */
    energyDraw: number;
    /** Total heat added to target systems over the operation's duration. */
    heat: number;
    /**
     * Systems whose `power` is forced to 0 while the operation is active, and
     * restored to its pre-operation value on completion or cancellation
     * (SPEC-0003: "a side effect that zeroes power is just a power write").
     */
    sideEffectSystems: RepairableSystemKey[];
    tier: RepairProtocolTier;
};

export const actuatorRecalibration: RepairProtocolStats = {
    name: 'Actuator recalibration',
    targets: [
        { system: 'thrusters', field: 'angleError' },
        { system: 'chainGun', field: 'angleOffset' },
        { system: 'smartPilot', field: 'offsetFactor' },
    ],
    duration: 45,
    energyDraw: 2,
    heat: 20,
    sideEffectSystems: ['chainGun'],
    tier: 'field',
};

export const thrustLinePurge: RepairProtocolStats = {
    name: 'Thrust-line purge',
    targets: [
        { system: 'thrusters', field: 'availableCapacity' },
        { system: 'maneuvering', field: 'efficiency' },
    ],
    duration: 60,
    energyDraw: 2,
    heat: 25,
    sideEffectSystems: ['thrusters'],
    tier: 'field',
};

export const feedSystemOverhaul: RepairProtocolStats = {
    name: 'Feed-system overhaul',
    targets: [
        { system: 'chainGun', field: 'rateOfFireFactor' },
        { system: 'magazine', field: 'capacity' },
    ],
    duration: 60,
    energyDraw: 2,
    heat: 25,
    sideEffectSystems: ['magazine'],
    tier: 'field',
};

export const sensorArrayDegauss: RepairProtocolStats = {
    name: 'Sensor-array degauss',
    targets: [
        { system: 'radars', field: 'malfunctionRangeFactor' },
        { system: 'signals', field: 'jobSuccessFactor' },
    ],
    duration: 30,
    energyDraw: 3,
    heat: 15,
    sideEffectSystems: ['radars'],
    tier: 'field',
};

export const signalProcessorRetune: RepairProtocolStats = {
    name: 'Signal-processor retune',
    targets: [
        { system: 'signals', field: 'jobSpeedFactor' },
        { system: 'docking', field: 'rangesFactor' },
    ],
    duration: 30,
    energyDraw: 2,
    heat: 15,
    sideEffectSystems: ['signals'],
    tier: 'field',
};

export const powerTrainReset: RepairProtocolStats = {
    name: 'Power-train reset',
    targets: [
        { system: 'reactor', field: 'effeciencyFactor' },
        { system: 'warp', field: 'velocityFactor' },
        { system: 'maneuvering', field: 'efficiency' },
    ],
    duration: 90,
    energyDraw: 1,
    heat: 30,
    sideEffectSystems: ['reactor', 'warp', 'maneuvering'],
    tier: 'field',
};

export const containmentFieldTuning: RepairProtocolStats = {
    name: 'Containment-field tuning',
    targets: [
        { system: 'warp', field: 'damageFactor' },
        { system: 'reactor', field: 'effeciencyFactor' },
    ],
    duration: 75,
    energyDraw: 3,
    heat: 30,
    sideEffectSystems: ['warp'],
    tier: 'field',
};

export const fireControlAlignment: RepairProtocolStats = {
    name: 'Fire-control alignment',
    targets: [
        { system: 'chainGun', field: 'angleOffset' },
        { system: 'smartPilot', field: 'offsetFactor' },
        { system: 'radars', field: 'malfunctionRangeFactor' },
    ],
    duration: 45,
    energyDraw: 2,
    heat: 20,
    sideEffectSystems: [],
    tier: 'field',
};

export const hullWideSystemsOverhaul: RepairProtocolStats = {
    name: 'Hull-wide systems overhaul',
    targets: [
        { system: 'thrusters', field: 'angleError' },
        { system: 'warp', field: 'velocityFactor' },
        { system: 'signals', field: 'jobSuccessFactor' },
        { system: 'docking', field: 'rangesFactor' },
    ],
    duration: 240,
    energyDraw: 1,
    heat: 10,
    sideEffectSystems: [],
    tier: 'docked',
};

// Coolant recharge (docked tier) is deliberately excluded: finite coolant (#1892) is out of
// scope this slice, and the mechanic has no defectible target to validate against.

export const repairProtocols = {
    actuatorRecalibration,
    thrustLinePurge,
    feedSystemOverhaul,
    sensorArrayDegauss,
    signalProcessorRetune,
    powerTrainReset,
    containmentFieldTuning,
    fireControlAlignment,
    hullWideSystemsOverhaul,
} as const satisfies Record<string, RepairProtocolStats>;

export type RepairProtocolName = keyof typeof repairProtocols;

/**
 * Resolves a catalog target/side-effect system key to its live instance(s) on `state`. A ship
 * design may legitimately lack a keyed system (e.g. `chainGun` is nullable) — callers get an
 * empty array, not a throw, so `validateRepairCatalog` can report a clear per-protocol error
 * instead of a raw crash.
 */
export function getRepairableSystemInstances(state: ShipState, key: RepairableSystemKey): SystemState[] {
    switch (key) {
        case 'thrusters':
            return [...state.thrusters];
        case 'tubes':
            return [...state.tubes];
        case 'chainGun':
            return state.chainGun ? [state.chainGun] : [];
        case 'radars':
            return [...state.radars];
        case 'reactor':
            return [state.reactor];
        case 'smartPilot':
            return [state.smartPilot];
        case 'magazine':
            return [state.magazine];
        case 'warp':
            return [state.warp];
        case 'docking':
            return [state.docking];
        case 'maneuvering':
            return [state.maneuvering];
        case 'signals':
            return [state.signals];
    }
}

/**
 * Validates every target pointer and side-effect system in `catalog` against the real ship built
 * from `state` (SPEC-0003: "a bad pointer fails startup, not gameplay"). Called from
 * `makeShipState` for every ship built. Covers two independent ways a catalog entry can be wrong:
 * a target field that doesn't exist as `@defectible` anywhere (typo in `field`), and a target or
 * side-effect system that resolves to no live instance on this particular ship (typo in `system`,
 * or a ship design that legitimately lacks that system, e.g. no chain gun).
 */
export function validateRepairCatalog(state: ShipState, catalog: Record<string, RepairProtocolStats>): void {
    const known = new Set<string>();
    for (const system of getSystems(state)) {
        const topLevelKey = system.pointer.split('/')[1];
        for (const defectible of system.defectibles) {
            known.add(`${topLevelKey}/${defectible.field}`);
        }
    }
    for (const [id, protocol] of Object.entries(catalog)) {
        for (const target of protocol.targets) {
            if (getRepairableSystemInstances(state, target.system).length === 0) {
                throw new Error(
                    `repair protocol "${id}" targets system "${target.system}" which does not exist on this ship`,
                );
            }
            const key = `${target.system}/${target.field}`;
            if (!known.has(key)) {
                throw new Error(
                    `repair protocol "${id}" targets unknown defectible field "${target.field}" on system "${target.system}"`,
                );
            }
        }
        for (const sideEffectSystem of protocol.sideEffectSystems) {
            if (getRepairableSystemInstances(state, sideEffectSystem).length === 0) {
                throw new Error(
                    `repair protocol "${id}" declares a side effect on system "${sideEffectSystem}" which does not exist on this ship`,
                );
            }
        }
    }
}
