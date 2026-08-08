import { DEFECTIBLE_METADATA } from '../game-field';
import { ShipState } from '../ship/ship-state';
import { SystemState } from '../ship/system';

/**
 * Ship-design-agnostic tier gate: a protocol above the ship's current repair
 * tier is refused at enqueue time (SPEC-0003 §done-conditions). `shipyard` is
 * declared but unreachable — no mechanic grants it.
 */
export type RepairProtocolTier = 'field' | 'docked' | 'shipyard';

export const REPAIR_TIER_ORDER: Record<RepairProtocolTier, number> = { field: 0, docked: 1, shipyard: 2 };

/**
 * The repair tier `state`'s ship currently qualifies for, derived live from docking state rather
 * than a static per-ship value: `'docked'` while the ship is docked, `'field'` otherwise
 * (including mid-transition `DOCKING`/`UNDOCKING`). `'shipyard'` is never returned — no mechanic
 * grants it.
 */
export function getEffectiveRepairTier(state: ShipState): RepairProtocolTier {
    return state.docking.isDocked ? 'docked' : 'field';
}

/**
 * Top-level ShipState field a repair-protocol target lives on. Mirrors the
 * keys `getSystems()` reports (the first path segment of a system pointer,
 * e.g. `/thrusters/0` -> `thrusters`, `/chainGuns/0` -> `chainGuns`).
 *
 * Declared as a const array (not a bare union) so `isRepairableSystemKey` can validate a plain
 * `string` read back off a `@gameField('string')` schema field at runtime — Colyseus schema wire
 * types have no string-literal-union primitive, so `SavedPowerEntry.system` can't carry this type
 * through serialization; a value read off it must be checked here before use.
 */
export const REPAIRABLE_SYSTEM_KEYS = [
    'thrusters',
    'tubes',
    'chainGuns',
    'radars',
    'reactor',
    'smartPilot',
    'magazine',
    'warp',
    'docking',
    'maneuvering',
    'signals',
] as const;

export type RepairableSystemKey = (typeof REPAIRABLE_SYSTEM_KEYS)[number];

const REPAIRABLE_SYSTEM_KEY_SET: ReadonlySet<string> = new Set(REPAIRABLE_SYSTEM_KEYS);

export function isRepairableSystemKey(value: string): value is RepairableSystemKey {
    return REPAIRABLE_SYSTEM_KEY_SET.has(value);
}

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
    /**
     * Overrides `duration` with a value read live from ship state each tick, for a protocol whose
     * duration is a GM-tweakable constant rather than a fixed catalog number (e.g. `armorPlateRenewal`
     * reads `state.armor.plateRepairSeconds`). Reread every tick, so a GM's live tweak affects an
     * already-active operation, not just future enqueues.
     */
    dynamicDuration?: (state: ShipState) => number;
    /**
     * Completion effect for a protocol with no defectible `targets` — SPEC-0003's target/reset
     * model only covers per-field `@defectible`s, so a protocol that writes state no defectible
     * can express (e.g. `ArmorPlate.health`, a plain `Schema` field) declares its effect here
     * instead. Run once, after `targets` are reset, only when the operation completes (never on
     * cancellation).
     */
    onComplete?: (state: ShipState) => void;
};

export const actuatorRecalibration: RepairProtocolStats = {
    name: 'Actuator recalibration',
    targets: [
        { system: 'thrusters', field: 'bearingSkew' },
        { system: 'chainGuns', field: 'bearingSkew' },
        { system: 'radars', field: 'bearingSkew' },
        { system: 'smartPilot', field: 'offsetFactor' },
    ],
    duration: 45,
    energyDraw: 2,
    heat: 20,
    sideEffectSystems: ['chainGuns'],
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
        { system: 'chainGuns', field: 'rateOfFireFactor' },
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
    // does NOT include 'reactor': zeroing the reactor's own power would zero its regen for the
    // operation's full 90s duration (effectiveness = broken ? 0 : power * hacked), which is an
    // accident of the authored numbers, not a designed tradeoff (R1, PR #2030 review)
    sideEffectSystems: ['warp', 'maneuvering'],
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

/**
 * `onComplete` for `launcherServoRecalibration`: forces every tube's safety back to locked —
 * the #2097 default — rather than leaving it however the crew left it mid-operation. Without this,
 * a tube unlocked while dark (side-effect power === SHUTDOWN, so it couldn't fire anyway) would
 * fire the instant power returns, which is not an "explicit per-tube player action" on the
 * now-repaired tube (see `Tube.safetyLocked`'s own doc comment).
 */
function relockTubeSafeties(state: ShipState): void {
    for (const tube of state.tubes) {
        tube.safetyLocked = true;
    }
}

export const launcherServoRecalibration: RepairProtocolStats = {
    name: 'Launcher servo recalibration',
    targets: [
        { system: 'tubes', field: 'bearingSkew' },
        { system: 'tubes', field: 'rateOfFireFactor' },
    ],
    duration: 45,
    energyDraw: 2,
    heat: 20,
    sideEffectSystems: ['tubes'],
    tier: 'field',
    onComplete: relockTubeSafeties,
};

export const fireControlAlignment: RepairProtocolStats = {
    name: 'Fire-control alignment',
    targets: [
        { system: 'chainGuns', field: 'bearingSkew' },
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
        { system: 'thrusters', field: 'bearingSkew' },
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

/**
 * Completion effect for `armorPlateRenewal`: fully heals the single most-damaged plate, a no-op if
 * every plate is already at max health. Defined here rather than in `ship/armor.ts` deliberately —
 * `configurations/` only ever needs `ShipState` as a type (elided at compile time, same as every
 * other protocol in this catalog); a real runtime import of a `ship/*` value from this module would
 * open a fresh circular-require edge (`configurations` -> `ship/armor` -> the core barrel ->
 * `configurations` again) that the existing type-only `ShipState` import never triggers.
 */
function repairWorstArmorPlate(state: ShipState): void {
    const plates = state.armor.armorPlates;
    let worst: (typeof plates)[number] | undefined;
    for (const plate of plates) {
        if (plate.healthRatio < 1 && (!worst || plate.healthRatio < worst.healthRatio)) {
            worst = plate;
        }
    }
    if (worst) {
        for (const layer of worst.layers) {
            layer.health = layer.maxHealth;
        }
    }
}

/**
 * Docked-tier, chunked-per-plate armour repair (issue #2078). No defectible `targets` — armour
 * stays a plain `Schema`, not a `SystemState`, so the queue's normal target/reset mechanism can't
 * see it; `onComplete` writes `ArmorPlate.health` directly instead (see `repairWorstArmorPlate`
 * above). `duration` is a placeholder never read: `dynamicDuration` always wins, sourcing the true
 * per-op duration from the GM-tweakable `Armor.plateRepairSeconds`. No energy cost, no heat, and
 * repeatable — re-enqueueable as many times as there are damaged plates, one plate per operation,
 * so undocking mid-repair only loses the single in-flight op (SPEC-0003's existing all-or-nothing
 * cancel), never plates already renewed.
 */
export const armorPlateRenewal: RepairProtocolStats = {
    name: 'Armor plate renewal',
    targets: [],
    duration: 10,
    dynamicDuration: (state) => state.armor.plateRepairSeconds,
    energyDraw: 0,
    heat: 0,
    sideEffectSystems: [],
    tier: 'docked',
    onComplete: repairWorstArmorPlate,
};

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
    armorPlateRenewal,
    launcherServoRecalibration,
} as const satisfies Record<string, RepairProtocolStats>;

export type RepairProtocolName = keyof typeof repairProtocols;

/**
 * Resolves a catalog target/side-effect system key to its live instance(s) on `state`. A ship
 * design may legitimately lack a keyed system (`chainGuns` may be empty, `warp` is nullable) —
 * callers get an empty array, not a throw, so `validateRepairCatalog` can report a clear
 * per-protocol error instead of a raw crash, and `isProtocolAvailable` can filter the protocol out
 * cleanly.
 */
export function getRepairableSystemInstances(state: ShipState, key: RepairableSystemKey): SystemState[] {
    switch (key) {
        case 'thrusters':
            return [...state.thrusters];
        case 'tubes':
            return [...state.tubes];
        case 'chainGuns':
            return [...state.chainGuns];
        case 'radars':
            return [...state.radars];
        case 'reactor':
            return [state.reactor];
        case 'smartPilot':
            return [state.smartPilot];
        case 'magazine':
            return [state.magazine];
        case 'warp':
            return state.warp ? [state.warp] : [];
        case 'docking':
            return [state.docking];
        case 'maneuvering':
            return [state.maneuvering];
        case 'signals':
            return [state.signals];
    }
}

/**
 * Validates every target field in `catalog` against the real `@defectible` fields declared on the
 * system class(es) `state` carries for that key (SPEC-0003: "a bad pointer fails startup, not
 * gameplay"). Called from `makeShipState` for every ship built.
 *
 * Checked against the raw `@defectible` decorator metadata, not `getSystems()`'s per-instance
 * `enabled` gate: a defectible can be a real, correctly-spelled field that is simply inactive on
 * every instance a particular hull happens to carry (radar `bearingSkew` is declared on every
 * `Turret`, including omni radars, but only *enabled* where `design.maxBearingSkew > 0` — a hull
 * whose only radar is an omni, e.g. dragonfly-MK2, would otherwise look like it has no such
 * field at all). That is a normal per-hull configuration difference, not a catalog bug.
 *
 * A ship that simply lacks a system a protocol references (`warp` is nullable, a future hull
 * might have no `tubes` or `chainGuns`, ...) is likewise a normal configuration, not a catalog bug
 * — `getProtocolAvailability` / `getAvailableRepairProtocols` filter those protocols out for that
 * ship instead. This function only throws for what *is* a genuine catalog bug: a `field` that
 * isn't a real `@defectible` name anywhere on a system the ship actually has (a typo
 * `RepairProtocolTarget.field` can't be caught by TypeScript, since it's a bare `string`).
 */
export function validateRepairCatalog(state: ShipState, catalog: Record<string, RepairProtocolStats>): void {
    for (const [id, protocol] of Object.entries(catalog)) {
        for (const target of protocol.targets) {
            const instances = getRepairableSystemInstances(state, target.system);
            if (instances.length === 0) {
                continue; // this ship doesn't have the system — not a catalog bug, see getProtocolAvailability
            }
            const hasField = instances.some(
                (instance) => Reflect.getMetadata(DEFECTIBLE_METADATA, instance, target.field) != null,
            );
            if (!hasField) {
                throw new Error(
                    `repair protocol "${id}" targets unknown defectible field "${target.field}" on system "${target.system}"`,
                );
            }
        }
    }
}

/**
 * Whether `protocol` can run at all on `state` — i.e. its tier is within what `state`'s ship
 * currently qualifies for (see `getEffectiveRepairTier`), and every system it targets or declares
 * a side effect on is actually fitted to this ship. This is the seam for "the protocols available
 * to *this* ship": further applicability conditions (current damage state, ...) are meant to layer
 * onto this same function later, not be built as parallel filters elsewhere.
 */
export function isProtocolAvailable(state: ShipState, protocol: RepairProtocolStats): boolean {
    if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(state)]) {
        return false;
    }
    const systems = [...protocol.targets.map((t) => t.system), ...protocol.sideEffectSystems];
    return systems.every((system) => getRepairableSystemInstances(state, system).length > 0);
}

/**
 * The subset of `catalog` that `isProtocolAvailable` on this particular ship — "the protocols
 * available to this ship" as a real, reusable concept, rather than every caller (the enqueue
 * command handler, the ECR catalog widget) re-deriving it independently.
 */
export function getAvailableRepairProtocols(
    state: ShipState,
    catalog: Record<string, RepairProtocolStats>,
): Record<string, RepairProtocolStats> {
    const available: Record<string, RepairProtocolStats> = {};
    for (const [id, protocol] of Object.entries(catalog)) {
        if (isProtocolAvailable(state, protocol)) {
            available[id] = protocol;
        }
    }
    return available;
}
