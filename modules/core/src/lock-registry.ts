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
