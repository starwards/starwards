import { ArraySchema, MapSchema, Metadata, Schema } from '@colyseus/schema';

type FieldType = string | { array: FieldType } | { map: FieldType } | (new () => Schema);

function isSchemaConstructor(type: FieldType): type is new () => Schema {
    return typeof type === 'function';
}

/**
 * Applies `source` onto `target` in place, field by field, instead of replacing `target`
 * wholesale — this preserves object identity for nested Schema/MapSchema/ArraySchema instances
 * so Colyseus's own dirty-tracking (and any code holding a reference to those instances)
 * keeps working. Used to apply replay frames onto the live game state without room churn.
 */
export function deepAssignSchema<T extends Schema>(target: T, source: T): void {
    const fields = Metadata.getFields(target.constructor) as Record<string, FieldType>;
    for (const [name, type] of Object.entries(fields)) {
        assignField(
            target as unknown as Record<string, unknown>,
            source as unknown as Record<string, unknown>,
            name,
            type,
        );
    }
}

function assignField(target: Record<string, unknown>, source: Record<string, unknown>, name: string, type: FieldType) {
    const sourceValue = source[name];
    if (typeof type === 'string') {
        target[name] = sourceValue;
        return;
    }
    if (isSchemaConstructor(type)) {
        assignNestedSchema(target, name, sourceValue as Schema | undefined);
        return;
    }
    if ('array' in type) {
        reconcileArray(target[name] as ArraySchema<unknown>, sourceValue as ArraySchema<unknown>, type.array);
        return;
    }
    if ('map' in type) {
        reconcileMap(target[name] as MapSchema, sourceValue as MapSchema, type.map);
        return;
    }
    target[name] = sourceValue;
}

function assignNestedSchema(target: Record<string, unknown>, name: string, sourceValue: Schema | undefined) {
    if (sourceValue == null) {
        target[name] = sourceValue;
        return;
    }
    const existing = target[name] as Schema | undefined;
    if (existing && existing.constructor === sourceValue.constructor) {
        deepAssignSchema(existing, sourceValue);
    } else {
        target[name] = sourceValue.clone();
    }
}

function reconcileMap(target: MapSchema, source: MapSchema, elementType: FieldType) {
    for (const key of [...target.keys()]) {
        if (!source.has(key)) {
            target.delete(key);
        }
    }
    for (const [key, sourceValue] of source) {
        if (typeof elementType === 'string' || !isSchemaConstructor(elementType)) {
            target.set(key, sourceValue as never);
            continue;
        }
        const existing = target.get(key) as Schema | undefined;
        if (existing && existing.constructor === (sourceValue as Schema).constructor) {
            deepAssignSchema(existing, sourceValue as Schema);
        } else {
            target.set(key, (sourceValue as Schema).clone() as never);
        }
    }
}

function reconcileArray(target: ArraySchema<unknown>, source: ArraySchema<unknown>, elementType: FieldType) {
    const schemaElements = isSchemaConstructor(elementType);
    // Element-wise, never `splice(0, length, ...source)`: a wholesale splice marks every index
    // dirty, so an unchanged array would still be re-broadcast to every client each frame.
    const minLen = Math.min(target.length, source.length);
    for (let i = 0; i < minLen; i++) {
        if (!schemaElements) {
            if (target[i] !== source[i]) {
                target[i] = source[i];
            }
            continue;
        }
        const existing = target[i] as Schema | undefined;
        const sourceValue = source[i] as Schema;
        if (existing && existing.constructor === sourceValue.constructor) {
            deepAssignSchema(existing, sourceValue);
        } else {
            target[i] = sourceValue.clone();
        }
    }
    for (let i = minLen; i < source.length; i++) {
        target.push(schemaElements ? (source[i] as Schema).clone() : source[i]);
    }
    if (target.length > source.length) {
        target.splice(source.length, target.length - source.length);
    }
}
