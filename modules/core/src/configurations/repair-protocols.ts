import { DEFECTIBLE_METADATA } from '../game-field';
import { RepairProtocolMode } from '../ship/repair-queue';
import { ShipState } from '../ship/ship-state';
import { SystemState } from '../ship/system';
import { allColyseusProperties } from '../traverse';

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

/**
 * The cost/effect numbers that differ between a field-tier protocol's two modes (issue #2255,
 * R1). `duration`/`energyDraw`/`heat` keep the same meaning per-mode as they always had on the
 * flat, single-mode shape below.
 */
export type RepairProtocolModeStats = {
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
};

type RepairProtocolStatsBase = {
    name: string;
    /** Defectible fields this protocol clears on completion. Cross-cutting by design (SPEC-0003). */
    targets: RepairProtocolTarget[];
    /**
     * Overrides `duration` with a value read live from ship state each tick, for a protocol whose
     * duration is a GM-tweakable constant rather than a fixed catalog number (e.g. `armorPlateRenewal`
     * reads `state.armor.plateRepairSeconds`). Reread every tick, so a GM's live tweak affects an
     * already-active operation, not just future enqueues. Always overrides the current mode's
     * `duration` — see `getModeStats`.
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
    /**
     * When true, the protocol needs one of the ship's finite `Reactor.energyCells` and refuses to
     * go pending past what's actually available (issue #2137) — see `getAvailableRepairProtocols` /
     * `RepairManager.availabilityRefusal`. The cell itself is spent the instant the protocol starts
     * running and refunded only if a wind-down cancellation reaches 0% (issue #2247) — see
     * `RepairManager.start` / `tickCancelling`.
     */
    consumesEnergyCell?: boolean;
};

/**
 * A field-tier protocol: a compromise done in the field, so it always offers both of #2255's
 * modes — {@link RepairProtocolMode.Responsive} (today's duration, no side effect) and
 * {@link RepairProtocolMode.Dark} (a third of the duration, today's side effect). Which mode a
 * given run actually uses is tracked per-slot (`RepairProtocolSlot.mode`), not here — this is the
 * static catalog price list for each mode, not a live selection.
 */
export type FieldRepairProtocolStats = RepairProtocolStatsBase & {
    tier: 'field';
    modes: Record<RepairProtocolMode, RepairProtocolModeStats>;
};

/**
 * A docked (or shipyard) tier protocol: the real thing, not a field compromise, so it stays
 * single-mode — same flat `duration`/`energyDraw`/`heat`/`sideEffectSystems` shape the whole
 * catalog used before #2255. Two modes are a field-tier property; do not add them here.
 */
export type SingleModeRepairProtocolStats = RepairProtocolStatsBase & {
    tier: 'docked' | 'shipyard';
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
};

export type RepairProtocolStats = FieldRepairProtocolStats | SingleModeRepairProtocolStats;

/**
 * The `duration`/`energyDraw`/`heat`/`sideEffectSystems` in effect for `protocol` under `mode` —
 * the single seam every caller (`RepairManager`, the repair-queue widget) reads instead of
 * branching on `protocol.tier` itself. A single-mode (docked/shipyard) protocol ignores `mode`
 * and always returns its one flat price; `mode` only matters for a field-tier protocol.
 */
export function getModeStats(protocol: RepairProtocolStats, mode: RepairProtocolMode): RepairProtocolModeStats {
    if (protocol.tier === 'field') {
        return protocol.modes[mode];
    }
    return {
        duration: protocol.duration,
        energyDraw: protocol.energyDraw,
        heat: protocol.heat,
        sideEffectSystems: protocol.sideEffectSystems,
    };
}

/**
 * Builds a field-tier protocol's two modes from today's numbers (issue #2255, R1): Responsive
 * keeps `base`'s duration with no side effect; Dark runs at a third of that duration with
 * `darkSideEffectSystems` (today's `sideEffectSystems`, unchanged).
 *
 * `energyDraw` (a rate) and `heat` (a fixed total budget, see {@link RepairProtocolModeStats})
 * are deliberately left unchanged between modes — the implementer's call the issue asked for,
 * stated here rather than at every call site: Dark isn't a *different* operation, just the same
 * one run to a tighter, riskier schedule, so its per-second energy/heat rates stay what the
 * catalog always authored. Duration shrinking to a third then means Dark's *total* energy cost
 * drops to a third of Responsive's, while its *total* heat stays the same — delivered three times
 * as fast (three times the heat per second) as the price of that darkened system.
 */
function fieldModes(
    base: { duration: number; energyDraw: number; heat: number },
    darkSideEffectSystems: RepairableSystemKey[],
): Record<RepairProtocolMode, RepairProtocolModeStats> {
    return {
        [RepairProtocolMode.Responsive]: { ...base, sideEffectSystems: [] },
        [RepairProtocolMode.Dark]: { ...base, duration: base.duration / 3, sideEffectSystems: darkSideEffectSystems },
    };
}

export const actuatorRecalibration: RepairProtocolStats = {
    name: 'Actuator recalibration',
    targets: [
        { system: 'thrusters', field: 'bearingSkew' },
        { system: 'chainGuns', field: 'bearingSkew' },
        { system: 'radars', field: 'bearingSkew' },
        { system: 'smartPilot', field: 'offsetFactor' },
    ],
    modes: fieldModes({ duration: 45, energyDraw: 2, heat: 20 }, ['chainGuns']),
    tier: 'field',
};

export const thrustLinePurge: RepairProtocolStats = {
    name: 'Thrust-line purge',
    targets: [
        { system: 'thrusters', field: 'availableCapacity' },
        { system: 'maneuvering', field: 'efficiency' },
    ],
    modes: fieldModes({ duration: 60, energyDraw: 2, heat: 25 }, ['thrusters']),
    tier: 'field',
};

export const feedSystemOverhaul: RepairProtocolStats = {
    name: 'Feed-system overhaul',
    targets: [
        { system: 'chainGuns', field: 'rateOfFireFactor' },
        { system: 'magazine', field: 'capacity' },
    ],
    modes: fieldModes({ duration: 60, energyDraw: 2, heat: 25 }, ['magazine']),
    tier: 'field',
};

export const sensorArrayDegauss: RepairProtocolStats = {
    name: 'Sensor-array degauss',
    targets: [
        { system: 'radars', field: 'malfunctionRangeFactor' },
        { system: 'signals', field: 'jobSuccessFactor' },
    ],
    modes: fieldModes({ duration: 30, energyDraw: 3, heat: 15 }, ['radars']),
    tier: 'field',
};

export const radarTraverseServoAlignment: RepairProtocolStats = {
    name: 'Radar traverse servo alignment',
    targets: [{ system: 'radars', field: 'turnSpeedFactor' }],
    modes: fieldModes({ duration: 30, energyDraw: 3, heat: 15 }, ['radars']),
    tier: 'field',
};

export const signalProcessorRetune: RepairProtocolStats = {
    name: 'Signal-processor retune',
    targets: [
        { system: 'signals', field: 'jobSpeedFactor' },
        { system: 'docking', field: 'rangesFactor' },
    ],
    modes: fieldModes({ duration: 30, energyDraw: 2, heat: 15 }, ['signals']),
    tier: 'field',
};

export const powerTrainReset: RepairProtocolStats = {
    name: 'Power-train reset',
    targets: [
        { system: 'reactor', field: 'effeciencyFactor' },
        { system: 'warp', field: 'velocityFactor' },
        { system: 'maneuvering', field: 'efficiency' },
    ],
    // does NOT include 'reactor' in its dark-mode side effect: zeroing the reactor's own power
    // would zero its regen for the operation's full duration (effectiveness = broken ? 0 : power *
    // hacked), which is an accident of the authored numbers, not a designed tradeoff (R1, PR #2030
    // review)
    modes: fieldModes({ duration: 90, energyDraw: 1, heat: 30 }, ['warp', 'maneuvering']),
    tier: 'field',
};

export const containmentFieldTuning: RepairProtocolStats = {
    name: 'Containment-field tuning',
    targets: [
        { system: 'warp', field: 'damageFactor' },
        { system: 'reactor', field: 'effeciencyFactor' },
    ],
    modes: fieldModes({ duration: 75, energyDraw: 3, heat: 30 }, ['warp']),
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
    modes: fieldModes({ duration: 45, energyDraw: 2, heat: 20 }, ['tubes']),
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
    // already had no side effect pre-#2255 (the 2026-08-08 §6.2 "scarce safe option") — under R1's
    // blanket rule its Dark mode inherits that same empty side-effect list, so the two modes here
    // differ only in duration; that is the intended, uneventful outcome of extending R1 to a
    // protocol that had nothing to darken in the first place.
    modes: fieldModes({ duration: 45, energyDraw: 2, heat: 20 }, []),
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

/**
 * `onComplete` for `reactorJumpStart` (issue #2137): the bootstrap effect the design calls for —
 * +30% reactor efficiency, +30% energy. No defectible `targets`: a partial +30% bump toward normal
 * is not the same operation as `resetTargets`'s full reset-to-normal, so (like `armorPlateRenewal`)
 * the effect is written here instead. The energy cell itself is spent by `RepairManager.start`
 * when the protocol begins running, not here — `consumesEnergyCell` protocols all share that one
 * spend/refund path (issue #2247).
 */
function jumpStartReactor(state: ShipState): void {
    const reactor = state.reactor;
    reactor.effeciencyFactor = Math.min(1, reactor.effeciencyFactor + 0.3);
    reactor.energy = Math.min(reactor.design.maxEnergy, reactor.energy + 0.3 * reactor.design.maxEnergy);
}

/**
 * Field-tier escape hatch for the reactor death-spiral (issue #2137): a damaged, energy-starved
 * reactor can't run the repair protocols that would fix it. Spends one of the ship's finite
 * `Reactor.energyCells` (restocked only while docked, see `ReactorCellManager`) to bootstrap just
 * enough efficiency and energy for normal repair protocols to progress. `energyDraw: 0` so it's
 * runnable from true zero energy — `RepairManager.tickRunning` never draws for a zero-draw
 * protocol.
 *
 * Like `fireControlAlignment`, this already had no side effect pre-#2255, so R1's Dark mode is
 * still side-effect-free here — only its duration (a third of Responsive's) differs.
 */
export const reactorJumpStart: RepairProtocolStats = {
    name: 'Reactor jump-start',
    targets: [],
    modes: fieldModes({ duration: 10, energyDraw: 0, heat: 0 }, []),
    tier: 'field',
    consumesEnergyCell: true,
    onComplete: jumpStartReactor,
};

/**
 * Closes the R3 coverage gap reported on issue #2255: `turnSpeedFactor` (`Turret`'s "turn speed"
 * defectible) was targeted for `radars` (`radarTraverseServoAlignment`) but not for the other
 * three turret-based systems that inherit the same field.
 */
export const turnSpeedGovernorTuning: RepairProtocolStats = {
    name: 'Turret traverse governor tuning',
    targets: [
        { system: 'thrusters', field: 'turnSpeedFactor' },
        { system: 'chainGuns', field: 'turnSpeedFactor' },
        { system: 'tubes', field: 'turnSpeedFactor' },
    ],
    modes: fieldModes({ duration: 45, energyDraw: 2, heat: 20 }, ['thrusters', 'chainGuns', 'tubes']),
    tier: 'field',
};

/**
 * Closes the other half of the R3 coverage gap reported on issue #2255: `bearingLimitFactor`
 * (`Turret`'s "traverse limit" defectible) had no protocol at all — not even `radars`, unlike
 * `turnSpeedFactor` above.
 */
export const traverseLimitRecalibration: RepairProtocolStats = {
    name: 'Traverse-limit recalibration',
    targets: [
        { system: 'thrusters', field: 'bearingLimitFactor' },
        { system: 'chainGuns', field: 'bearingLimitFactor' },
        { system: 'radars', field: 'bearingLimitFactor' },
        { system: 'tubes', field: 'bearingLimitFactor' },
    ],
    modes: fieldModes({ duration: 60, energyDraw: 2, heat: 25 }, ['thrusters', 'chainGuns', 'radars', 'tubes']),
    tier: 'field',
};

export const repairProtocols = {
    actuatorRecalibration,
    thrustLinePurge,
    feedSystemOverhaul,
    sensorArrayDegauss,
    radarTraverseServoAlignment,
    signalProcessorRetune,
    powerTrainReset,
    containmentFieldTuning,
    fireControlAlignment,
    hullWideSystemsOverhaul,
    armorPlateRenewal,
    launcherServoRecalibration,
    reactorJumpStart,
    // Appended, not interleaved: catalog position drives the engineer screen's hotkey assignment
    // (see `getRepairProtocolHotkey` in `widgets/repair-queue.ts`) — inserting these earlier would
    // shift every hotkey after them. These two also happen to exactly fill the last two slots of
    // `REPAIR_PROTOCOL_HOTKEYS` (alt+r, alt+t).
    turnSpeedGovernorTuning,
    traverseLimitRecalibration,
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
 * Every `@defectible` field declared on a system in `REPAIRABLE_SYSTEM_KEYS` that no protocol in
 * `catalog` targets (issue #2255, R3) — the exact "covered system, uncovered field" gap that let
 * `radars/turnSpeedFactor` decay with no counterplay until #2109. Walks `state`'s live schema tree
 * (same `allColyseusProperties` traversal `getSystems`/`getColyseusPrimitivesJsonPointers` use)
 * checking raw decorator metadata directly, same as `validateRepairCatalog` above, so a field
 * declared but disabled on every instance `state`'s ship happens to carry (see that function's own
 * doc comment) still counts as needing a protocol — `state` should be a ship design that fits
 * (and enables) every system this catalog could reference, e.g. the dragonfly.
 */
export function findUncoveredDefectibleFields(
    state: ShipState,
    catalog: Record<string, RepairProtocolStats>,
): RepairProtocolTarget[] {
    const targeted = new Set(Object.values(catalog).flatMap((p) => p.targets.map((t) => `${t.system}/${t.field}`)));
    const uncovered: RepairProtocolTarget[] = [];
    const seen = new Set<string>();
    for (const [instance, systemPointer, field] of allColyseusProperties(state)) {
        if (!(instance instanceof SystemState) || typeof field !== 'string') {
            continue;
        }
        if (Reflect.getMetadata(DEFECTIBLE_METADATA, instance, field) == null) {
            continue;
        }
        const topLevelKey = systemPointer.split('/')[1] ?? '';
        if (!isRepairableSystemKey(topLevelKey)) {
            continue;
        }
        const key = `${topLevelKey}/${field}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        if (!targeted.has(key)) {
            uncovered.push({ system: topLevelKey, field });
        }
    }
    return uncovered;
}

/**
 * Whether every system `protocol` targets or declares a side effect on (either mode, for a
 * field-tier protocol) is actually fitted to this ship — a fixed property of the ship's design,
 * unlike tier or energy-cell state, which change live. Split out from `isProtocolAvailable` (issue
 * #2247 review) so a display-only filter (the repair-queue widget hiding rows for equipment this
 * ship structurally lacks) can check exactly this, without also hiding a docked-tier or
 * out-of-cells protocol that should stay visible and explain itself via the slot's
 * `refusalReason`.
 */
export function hasProtocolEquipment(state: ShipState, protocol: RepairProtocolStats): boolean {
    const sideEffectSystems =
        protocol.tier === 'field'
            ? [
                  ...new Set([
                      ...protocol.modes[RepairProtocolMode.Responsive].sideEffectSystems,
                      ...protocol.modes[RepairProtocolMode.Dark].sideEffectSystems,
                  ]),
              ]
            : protocol.sideEffectSystems;
    const systems = [...protocol.targets.map((t) => t.system), ...sideEffectSystems];
    return systems.every((system) => getRepairableSystemInstances(state, system).length > 0);
}

/**
 * Whether `protocol` can run at all on `state` — i.e. its tier is within what `state`'s ship
 * currently qualifies for (see `getEffectiveRepairTier`), it has an energy cell if it needs one,
 * and it has {@link hasProtocolEquipment}. This is the seam for "the protocols available to *this*
 * ship": further applicability conditions (current damage state, ...) are meant to layer onto this
 * same function later, not be built as parallel filters elsewhere.
 */
export function isProtocolAvailable(state: ShipState, protocol: RepairProtocolStats): boolean {
    if (REPAIR_TIER_ORDER[protocol.tier] > REPAIR_TIER_ORDER[getEffectiveRepairTier(state)]) {
        return false;
    }
    if (protocol.consumesEnergyCell && state.reactor.energyCells <= 0) {
        return false;
    }
    return hasProtocolEquipment(state, protocol);
}

/**
 * The subset of `catalog` that `isProtocolAvailable` on this particular ship — "the protocols
 * available to this ship" as a real, reusable concept, rather than every caller (the enqueue
 * command handler, the engineer catalog widget) re-deriving it independently.
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
