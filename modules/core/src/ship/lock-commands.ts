import { LockPropertyArg, ShipState } from './ship-state';

import { Schema } from '@colyseus/schema';
import { getJsonPointer } from '../json-ptr';
import { isCommandable } from '../game-field';
import { setFieldLocked } from '../lock-registry';

/**
 * `ShipState.lockCommands` queue element. `setValue` never touches state
 * directly (see the "Commands" pattern in CLAUDE.md) — it enqueues, and
 * `applyLockCommands` drains the queue from `ShipManager.update()`, the same
 * place every other ship-scoped command queue is drained.
 */
export const lockProperty = {
    cmdName: 'lockProperty',
    setValue: (state: ShipState, value: LockPropertyArg) => {
        state.lockCommands.push(value);
    },
};

/**
 * Resolves a JSON Pointer (relative to `root`) down to the Schema instance
 * that actually owns the field, and the field name — the same two pieces
 * `setFieldLocked`/`isFieldLocked` key on. Mirrors the parent-segment
 * traversal `JsonPointer.set` already does for its own ancestor walk.
 */
function resolveLockTarget(root: Schema, pointer: string): { parent: Schema; field: string } | null {
    const jsonPointer = getJsonPointer(pointer);
    if (!jsonPointer || jsonPointer.path.length === 0) {
        return null;
    }
    const field = jsonPointer.path[jsonPointer.path.length - 1];
    if (typeof field !== 'string') {
        return null;
    }
    if (jsonPointer.path.length === 1) {
        return { parent: root, field };
    }
    const parentPointer = getJsonPointer(pointer.slice(0, pointer.length - `/${field}`.length));
    const parent = parentPointer?.get(root);
    return parent instanceof Schema ? { parent, field } : null;
}

/**
 * Drains `state.lockCommands`, applying each lock/unlock to the fast
 * (WeakMap-based) write guard in `lock-registry.ts` and mirroring the
 * currently-locked set onto the synced `state.lockedPaths` so the GM tweak
 * panel can render lock state. Only paths that are already part of the GM/
 * player command surface (`isCommandable`) can be locked — otherwise a
 * malformed path could silently freeze an internal, non-tweakable field.
 */
export function applyLockCommands(state: ShipState) {
    if (state.lockCommands.length === 0) {
        return;
    }
    for (const { path, locked } of state.lockCommands) {
        const target = resolveLockTarget(state, path);
        if (!target || !isCommandable(target.parent, target.field)) {
            continue;
        }
        setFieldLocked(target.parent, target.field, locked);
        const index = state.lockedPaths.indexOf(path);
        if (locked && index === -1) {
            state.lockedPaths.push(path);
        } else if (!locked && index !== -1) {
            state.lockedPaths.splice(index, 1);
        }
    }
    state.lockCommands.length = 0;
}
