import { ArraySchema, Schema } from '@colyseus/schema';
import { gameField } from '../game-field';
import { range } from '../range';

/**
 * A protocol's current priority: mutually exclusive, one per {@link RepairProtocolSlot}.
 * `OFF`/`LOW`/`MEDIUM`/`HIGH` are player-set (engineer hotkeys, GM clicks); `RUNNING`/`CANCELLING`
 * are server-only, set exclusively by `RepairManager`. There is no separate queue list: a protocol
 * never needs to be pending more than once, so its whole backlog state is this one field.
 */
export enum RepairPriority {
    OFF,
    LOW,
    MEDIUM,
    HIGH,
    RUNNING,
    CANCELLING,
}

/**
 * A system's `power` before a protocol's declared side effect forced it to 0, so it can be
 * restored on completion/cancellation. `@gameField` (not a plain server-only field) so it survives
 * `Schema.clone()` — an NPC<->PC conversion mid-run must still be able to revert the side effect via
 * `revertSlotSideEffects` (see `repair-manager.ts`), which needs no live `RepairManager` instance to
 * do so.
 */
export class SavedPowerEntry extends Schema {
    @gameField('string') system = '';
    @gameField('uint8') index = 0;
    @gameField('float32') value = 0;
}

/**
 * One catalog protocol's whole backlog/run state — one slot per protocol, in catalog order,
 * created once by `RepairManager` and never added to or removed from afterwards (see issue #2247).
 */
export class RepairProtocolSlot extends Schema {
    @gameField('string') protocolId = '';

    @gameField('int8') priority: RepairPriority = RepairPriority.OFF;

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    /**
     * Seconds of continuous energy shortfall so far while RUNNING (real time, not ticks — see
     * `ENERGY_STARVATION_GRACE_SECONDS` in `repair-manager.ts`). A momentary dip from an unrelated
     * consumer must not destroy a nearly-complete run; only a *sustained* shortfall aborts it.
     */
    @gameField('float32') starvedSeconds = 0;

    /**
     * True for every tick this slot's energy draw could not be covered while RUNNING, from the
     * very first shortfall tick — not only once `starvedSeconds` crosses
     * `ENERGY_STARVATION_GRACE_SECONDS` and the run actually aborts. Lets the repair-queue widget
     * show *why* a running protocol's progress bar has stalled during the grace window.
     */
    @gameField('boolean') energyStarved = false;

    @gameField([SavedPowerEntry])
    savedPower = new ArraySchema<SavedPowerEntry>();

    /**
     * Why the last attempt to raise this slot's priority was refused (above the ship's repair
     * tier, no energy cell, no matching equipment) — or why a run of it was force-stopped (a
     * sustained energy shortfall, or losing the repair tier mid-run). Cleared the moment the player
     * next changes this slot's priority (see `RepairManager`'s `handleCycle`). Empty when there's
     * nothing to show.
     */
    @gameField('string') refusalReason = '';
}

export type CycleRepairPriorityArg = { protocolId: string; direction: 'up' | 'down' };

/**
 * The client-supplied command payload is untyped at runtime (only `StateCommand`'s generic gives
 * it a compile-time shape) — a malformed or hostile message (`null`, a string, `{}`) must degrade
 * to a no-op rather than throw out of destructuring and abort the whole server tick.
 */
export function isCycleRepairPriorityArg(value: unknown): value is CycleRepairPriorityArg {
    return (
        !!value &&
        typeof value === 'object' &&
        typeof (value as CycleRepairPriorityArg).protocolId === 'string' &&
        ((value as CycleRepairPriorityArg).direction === 'up' || (value as CycleRepairPriorityArg).direction === 'down')
    );
}

/**
 * Server-authoritative per-protocol repair priority state (issue #2247): one {@link RepairProtocolSlot}
 * per catalog protocol, populated once by `RepairManager`'s constructor. Clients send priority changes
 * through `cycleRepairPriority` (see `repair-commands.ts`), queued here and drained by
 * `RepairManager.update()` (same pattern as `SpaceState`'s `*Commands` arrays).
 */
export class RepairQueue extends Schema {
    /** One per catalog protocol, in catalog order (= hotkey order). Never resized after construction. */
    @gameField([RepairProtocolSlot])
    slots = new ArraySchema<RepairProtocolSlot>();

    // server only, used for commands
    public cyclePriorityCommands = Array.of<CycleRepairPriorityArg>();
}
