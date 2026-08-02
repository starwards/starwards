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
    @gameField([RepairOperation])
    operations = new ArraySchema<RepairOperation>();

    // server only, used for commands
    public enqueueCommands = Array.of<EnqueueRepairArg>();
    public cancelCommands = Array.of<CancelRepairArg>();
    public reorderCommands = Array.of<ReorderRepairArg>();
}
