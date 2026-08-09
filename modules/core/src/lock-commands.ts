import { ArraySchema, Schema } from '@colyseus/schema';

import { StateCommand } from './commands';
import { getJsonPointer } from './json-ptr';
import { isCommandable } from './game-field';
import { setFieldLocked } from './lock-registry';

export type LockPropertyArg = { path: string; locked: boolean };

/**
 * A room-root state (`ShipState`, `SpaceState`) that carries a GM property-lock
 * queue and its synced mirror. `lockCommands` is drained each tick by
 * `applyLockCommands`, exactly like every other command queue in this codebase
 * (see the "Commands" pattern in CLAUDE.md) — `lockProperty.setValue` never
 * touches state directly.
 */
export interface Lockable {
    lockCommands: LockPropertyArg[];
    lockedPaths: ArraySchema<string>;
}

/**
 * `lockProperty` command (`{path, locked}`), shared by every room whose root
 * state implements `Lockable` — today `ShipState` and `SpaceState`. One
 * instance is reused across rooms; `cmdReceivers` only needs `cmdName`/
 * `setValue`, so the broader `Schema & Lockable` parameter type is compatible
 * with any specific room's `Stateful<S>` manager.
 */
export const lockProperty: StateCommand<LockPropertyArg, Schema & Lockable, void> = {
    cmdName: 'lockProperty',
    setValue: (state, value) => {
        state.lockCommands.push(value);
    },
};

export const lockCommands = { lockProperty };

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
export function applyLockCommands(state: Schema & Lockable) {
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
