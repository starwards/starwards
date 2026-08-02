import { ArraySchema, Schema } from '@colyseus/schema';
import { gameField } from '../game-field';
import { range } from '../range';

export enum RepairOperationStatus {
    QUEUED,
    ACTIVE,
    DONE,
    CANCELLED,
}

export class RepairOperation extends Schema {
    @gameField('string') id = '';
    @gameField('string') protocolId = '';
    @gameField('int8') status: RepairOperationStatus = RepairOperationStatus.QUEUED;

    @range([0, 1])
    @gameField('float32')
    progress = 0;
}

export type EnqueueRepairArg = { protocolId: string };
export type CancelRepairArg = { operationId: string };
export type ReorderRepairArg = { operationId: string; index: number };

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
