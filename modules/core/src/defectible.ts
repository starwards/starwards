/* eslint-disable @typescript-eslint/ban-types */
import 'reflect-metadata';

import { ArraySchema, CollectionSchema, MapSchema, Schema, SetSchema } from '@colyseus/schema';
import { Colyseus, Container } from 'colyseus-events';

const propertyMetadataKey = Symbol('defectible:propertyMetadata');

export type DefectibleConfig = { normal: number; name: string };
export type DefectibleValue = DefectibleConfig & { pointer: string; value: number };

export function defectible(m: DefectibleConfig) {
    return (target: Object, propertyKey: string | symbol) => {
        Reflect.defineMetadata(propertyMetadataKey, m, target, propertyKey);
    };
}

export function getDefectibles(root: Schema): DefectibleValue[] {
    const result = new Array<DefectibleValue>();
    for (const [state, field, value, pointer] of allProperties(root)) {
        if (typeof value === 'number') {
            const config = Reflect.getMetadata(propertyMetadataKey, state, field) as DefectibleConfig | undefined;
            if (config) {
                result.push({ ...config, pointer, value });
            }
        }
    }
    return result;
}

export const schemaKeys = Object.freeze(Object.keys(new (class extends Schema {})()).concat(['onChange', 'onRemove']));
function* allProperties(state: Colyseus, namespace = ''): IterableIterator<[Container, string, Colyseus, string]> {
    if (state && typeof state == 'object') {
        if (
            state instanceof ArraySchema ||
            state instanceof MapSchema ||
            state instanceof SetSchema ||
            state instanceof CollectionSchema
        ) {
            for (const [field, value] of state.entries()) {
                const fieldNamespace = `${namespace}/${field}`;
                yield* allProperties(value as Colyseus, fieldNamespace);
            }
        } else if (state instanceof Schema) {
            for (const [field, value] of Object.entries(state)) {
                if (!schemaKeys.includes(field)) {
                    const fieldNamespace = `${namespace}/${field}`;
                    yield [state, field, value as Colyseus, fieldNamespace];
                    yield* allProperties(value as Colyseus, fieldNamespace);
                }
            }
        }
    }
}
