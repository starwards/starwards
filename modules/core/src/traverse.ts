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
    // @ts-ignore: access _definition to get fields list
    return Object.values(state._definition.fieldsByIndex);
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
