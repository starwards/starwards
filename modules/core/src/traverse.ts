import { ArraySchema, CollectionSchema, MapSchema, Schema, SetSchema } from '@colyseus/schema';
import { Colyseus, Container, isPrimitive } from 'colyseus-events';

export function* getColyseusPrimitivesJsonPointers(state: Colyseus) {
    for (const [_, systemPointer, field, value] of allColyseusProperties(state)) {
        if (isPrimitive(value)) {
            yield `${systemPointer}/${field}`;
        }
    }
}

export function getFieldsList<T extends Schema>(state: T): Exclude<keyof T, keyof Schema>[] {
    // v3 API: Symbol.metadata on constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constructor = (state as any).constructor;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const metadata = constructor[Symbol.metadata];

    if (metadata) {
        const fields: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        for (const index in metadata) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const field = metadata[index];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (field && field.name && !field.deprecated) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
                fields.push(field.name);
            }
        }
        return fields as Exclude<keyof T, keyof Schema>[];
    }

    // Fallback for v2 or if metadata is not available
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const definition = constructor._definition as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (definition?.fieldsByIndex) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
        return Object.values(definition.fieldsByIndex);
    }

    return [];
}

export function* allColyseusProperties(
    root: Colyseus,
): IterableIterator<[Container, string, string | number, Colyseus]> {
    const states: [Colyseus, string][] = [[root, '']];
    for (const [state, namespace] of states) {
        if (state && typeof state == 'object') {
            if (
                state instanceof ArraySchema ||
                state instanceof MapSchema ||
                state instanceof SetSchema ||
                state instanceof CollectionSchema
            ) {
                for (const [field, value] of state.entries()) {
                    const fieldNamespace = `${namespace}/${field}`;
                    yield [state, namespace, field, value];
                    states.push([value as Colyseus, fieldNamespace]);
                }
            } else if (state instanceof Schema) {
                for (const field of getFieldsList(state)) {
                    const value = state[field];
                    const fieldNamespace = `${namespace}/${field as string}`;
                    yield [state, namespace, field, value];
                    states.push([value, fieldNamespace]);
                }
            }
        }
    }
}
