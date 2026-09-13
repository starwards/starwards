import { ArraySchema, Schema } from '@colyseus/schema';
import { gameField } from '../game-field';
import { range } from '../range';

/**
 * Per-protocol priority state (issue #2247): mutually exclusive, one per protocol slot. A protocol
 * never needs to be in the backlog more than once, so there is no separate ordered list, no
 * reordering and no duplicates — the priority itself carries the intent.
 *
 * `OFF`/`LOW`/`MEDIUM`/`HIGH` are player-set (engineer hotkeys, or GM clicks). `RUNNING`/
 * `CANCELLING` are server-only: `RepairManager` promotes the highest-priority pending slot to
 * `RUNNING`, and a priority key pressed on a `RUNNING` slot moves it to `CANCELLING` — a wind-down
 * (progress runs back to 0%, like a missile unload) rather than an instant stop.
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
 * A system's `power` before a repair protocol's declared side effect forced it to 0, so it can be
 * restored on completion, self-abort or wind-down. `@gameField` (not a plain server-only field) so
 * it survives `Schema.clone()` — an NPC<->PC conversion mid-run must still be able to revert the
 * side effect via `revertRepairSlot` (see `repair-manager.ts`), which needs no live `RepairManager`
 * instance to do so.
 */
export class SavedPowerEntry extends Schema {
    @gameField('string') system = '';
    @gameField('uint8') index = 0;
    @gameField('float32') value = 0;
}

/** One catalog protocol's live state. `RepairQueue.slots` carries exactly one of these per protocol. */
export class RepairProtocolSlot extends Schema {
    @gameField('string') protocolId = '';

    /** `RUNNING`/`CANCELLING` are set only by `RepairManager`; the rest are player-set. */
    @gameField('int8') priority: RepairPriority = RepairPriority.OFF;

    /** Meaningful only while `RUNNING`/`CANCELLING` — 0 the rest of the time. */
    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField([SavedPowerEntry])
    savedPower = new ArraySchema<SavedPowerEntry>();

    /**
     * Seconds of continuous energy shortfall so far while `RUNNING` (real time, not ticks — see
     * `ENERGY_STARVATION_GRACE_SECONDS` in `repair-manager.ts`). A momentary dip from an unrelated
     * consumer must not destroy a nearly-complete run; only a *sustained* shortfall aborts it.
     */
    @gameField('float32') starvedSeconds = 0;

    /**
     * True for every tick a `RUNNING` slot's declared energy draw could not be covered, from the
     * very first shortfall tick — not only once `starvedSeconds` crosses
     * `ENERGY_STARVATION_GRACE_SECONDS` and the run actually aborts. Lets the repair-queue widget
     * show *why* a stalled progress bar isn't moving during the grace window.
     */
    @gameField('boolean') energyStarved = false;

    /**
     * Why the most recent priority-raise attempt on this slot was refused (protocol unavailable:
     * above tier, no energy cell, missing equipment), or why a `RUNNING`/pending slot dropped to
     * `OFF` on its own (tier lost, sustained energy starvation, ...). Cleared the moment the player
     * changes this slot's priority again. Empty string when there's nothing to show.
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
 * Server-authoritative repair queue (issue #2247): one slot per catalog protocol, fixed in catalog
 * order (`RepairManager` populates it on construction). Only `RepairManager` mutates a slot's
 * `priority`/`progress`/etc; clients request priority changes through `cycleRepairPriority` (see
 * `repair-commands.ts`), queued here and drained by `RepairManager.update()` (same pattern as
 * `SpaceState`'s `*Commands` arrays).
 */
export class RepairQueue extends Schema {
    /** One entry per catalog protocol, in catalog order. */
    @gameField([RepairProtocolSlot])
    slots = new ArraySchema<RepairProtocolSlot>();

    // server only, used for commands
    public cyclePriorityCommands = Array.of<CycleRepairPriorityArg>();
}
