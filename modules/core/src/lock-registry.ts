import { Schema } from '@colyseus/schema';

/**
 * Per-instance, per-field write lock. When a field is locked, every write to
 * it is silently ignored — both through the JSON Pointer command surface
 * (`JsonPointer.set` / `handleJsonPointerCommand`) and through a plain JS
 * assignment from server-side game logic. Both paths invoke the same
 * Colyseus-generated property setter (wrapped in `game-field.ts`'s
 * `gameField()`), so this is the single choke point for both.
 *
 * Keyed by instance identity rather than a root-relative JSON path: the
 * instance a locked field lives on (e.g. a specific ship's `SmartPilot`) is
 * already uniquely addressed by the time a GM command resolves a JSON
 * pointer down to (parent instance, field name).
 */
const lockedFieldsByInstance = new WeakMap<Schema, Set<string>>();

export function isFieldLocked(instance: Schema, field: string): boolean {
    if (bypassDepth > 0) {
        return false;
    }
    return lockedFieldsByInstance.get(instance)?.has(field) ?? false;
}

export function setFieldLocked(instance: Schema, field: string, locked: boolean): void {
    if (locked) {
        let fields = lockedFieldsByInstance.get(instance);
        if (!fields) {
            fields = new Set();
            lockedFieldsByInstance.set(instance, fields);
        }
        fields.add(field);
    } else {
        lockedFieldsByInstance.get(instance)?.delete(field);
    }
}

/**
 * Depth counter, not a boolean: the GM tweak panel's write path resolves a JSON Pointer down
 * through possibly-nested Schema instances (`json-ptr.ts`'s ancestor walk), and a write itself
 * can synchronously trigger further writes (e.g. a setter with side effects). A boolean flag
 * cleared by the first `finally` to run would re-lock the field for an outer call still in
 * flight. Synchronous only: the whole write path (`JsonPointer.set` → Colyseus setter) is
 * synchronous, so an async bypass would leave the field thawed for every other writer for the
 * rest of the tick — `withLockBypass` intentionally has no async form.
 */
let bypassDepth = 0;

/**
 * Runs `fn` with the write lock disabled — `isFieldLocked` returns `false` for every field for
 * the duration of the (synchronous) call, restored via `finally` even if `fn` throws. This is
 * the GM tweak panel's override: its writes must land regardless of any lock, because the GM's
 * operational decision outranks the lock (see `commands.ts`'s `handleGmSetValueCommand`, the
 * only caller). Admission gating (`@commandable`, invariant I4) is untouched by this — the
 * bypass only lifts the lock, not the write-surface whitelist `JsonPointer.set` still enforces.
 */
export function withLockBypass<T>(fn: () => T): T {
    bypassDepth++;
    try {
        return fn();
    } finally {
        bypassDepth--;
    }
}
