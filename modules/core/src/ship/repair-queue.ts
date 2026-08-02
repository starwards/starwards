import { ArraySchema, Schema } from '@colyseus/schema';
import { gameField } from '../game-field';
import { range } from '../range';

export enum RepairOperationStatus {
    QUEUED,
    ACTIVE,
    DONE,
    CANCELLED,
}

/**
 * A system's `power` before a repair operation's declared side effect forced it to 0, so it can
 * be restored on completion/cancellation. `@gameField` (not a plain server-only field) so it
 * survives `Schema.clone()` — an NPC<->PC conversion mid-operation must still be able to revert
 * the side effect via `revertOperationSideEffects` (see `repair-manager.ts`), which needs no live
 * `RepairManager` instance to do so.
 */
export class SavedPowerEntry extends Schema {
    @gameField('string') system = '';
    @gameField('uint8') index = 0;
    @gameField('float32') value = 0;
}

export class RepairOperation extends Schema {
    @gameField('string') id = '';
    @gameField('string') protocolId = '';
    @gameField('int8') status: RepairOperationStatus = RepairOperationStatus.QUEUED;

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField([SavedPowerEntry])
    savedPower = new ArraySchema<SavedPowerEntry>();

    /**
     * Seconds of continuous energy shortfall so far while ACTIVE (real time, not ticks — see
     * `ENERGY_STARVATION_GRACE_SECONDS` in `repair-manager.ts`). A momentary dip from an unrelated
     * consumer must not destroy a nearly-complete operation; only a *sustained* shortfall aborts it.
     */
    @gameField('float32') starvedSeconds = 0;

    /**
     * Seconds left before a DONE/CANCELLED operation is removed from `RepairQueue.recentlyFinished`
     * (real time, not ticks — a quantity measured in "one manager tick" silently changes meaning
     * with the tick rate and is invisible whenever the tick is shorter than the network patch
     * interval, which it always is here). See `RepairManager`'s `tickRecentlyFinished`.
     */
    @gameField('float32') terminalSecondsRemaining = 0;
}

export type EnqueueRepairArg = { protocolId: string };
export type CancelRepairArg = { operationId: string };
export type ReorderRepairArg = { operationId: string; index: number };

/**
 * The client-supplied command payload is untyped at runtime (only `StateCommand`'s generic gives
 * it a compile-time shape) — a malformed or hostile message (`null`, a string, `{}`) must degrade
 * to a no-op rather than throw out of destructuring and abort the whole server tick.
 */
export function isEnqueueRepairArg(value: unknown): value is EnqueueRepairArg {
    return !!value && typeof value === 'object' && typeof (value as EnqueueRepairArg).protocolId === 'string';
}
export function isCancelRepairArg(value: unknown): value is CancelRepairArg {
    return !!value && typeof value === 'object' && typeof (value as CancelRepairArg).operationId === 'string';
}
export function isReorderRepairArg(value: unknown): value is ReorderRepairArg {
    return (
        !!value &&
        typeof value === 'object' &&
        typeof (value as ReorderRepairArg).operationId === 'string' &&
        Number.isFinite((value as ReorderRepairArg).index)
    );
}

/**
 * Server-authoritative repair queue: only `RepairManager` mutates `operations`.
 * Clients render the synced list and send commands through `enqueueRepair` /
 * `cancelRepair` / `reorderRepair` (see `repair-commands.ts`), queued here and
 * drained by `RepairManager.update()` (same pattern as `SpaceState`'s
 * `*Commands` arrays).
 */
export class RepairQueue extends Schema {
    /** Only QUEUED and ACTIVE operations — the ACTIVE one, if any, is always `operations[0]`. */
    @gameField([RepairOperation])
    operations = new ArraySchema<RepairOperation>();

    /**
     * DONE/CANCELLED operations, moved here off `operations` the instant they finish so the
     * "ACTIVE is always operations[0]" invariant never has to account for a lingering terminal
     * entry. Retained for `terminalSecondsRemaining` each so the crew can see a repair finished (or
     * was cancelled) before the row disappears — see `RepairManager.tickRecentlyFinished`.
     */
    @gameField([RepairOperation])
    recentlyFinished = new ArraySchema<RepairOperation>();

    /**
     * The reason the most recent enqueue command was refused (unknown protocol, above the ship's
     * repair tier, no matching systems fitted, or the queue is full), shown to the crew for
     * `refusalSecondsRemaining` — otherwise a refused click (e.g. the queue-length cap) just does
     * nothing with no feedback. Empty string when there's nothing to show.
     */
    @gameField('string') refusalReason = '';
    @gameField('float32') refusalSecondsRemaining = 0;

    // server only, used for commands
    public enqueueCommands = Array.of<EnqueueRepairArg>();
    public cancelCommands = Array.of<CancelRepairArg>();
    public reorderCommands = Array.of<ReorderRepairArg>();
}
