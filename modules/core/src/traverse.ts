import { ArraySchema, CollectionSchema, MapSchema, Schema, SetSchema } from '@colyseus/schema';
import { Colyseus, Container, isPrimitive } from 'colyseus-events';

import { getKeys } from './utils';

export function* getColyseusPrimitivesJsonPointers(state: Colyseus) {
    for (const [_, systemPointer, field, value] of allColyseusProperties(state)) {
        if (isPrimitive(value)) {
            yield `${systemPointer}/${field}`;
        }
    }
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
                const constructor = state.constructor as typeof Schema;
                const schema = constructor._definition.schema as { [k in keyof Schema]: unknown };
                for (const field of getKeys(schema)) {
                    const value = state[field] as Colyseus;
                    const fieldNamespace = `${namespace}/${field}`;
                    yield [state, namespace, field, value];
                    states.push([value, fieldNamespace]);
                }
            }
        }
    }
}
