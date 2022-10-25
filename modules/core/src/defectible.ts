/* eslint-disable @typescript-eslint/ban-types */
import 'reflect-metadata';

import { ArraySchema, CollectionSchema, MapSchema, Schema, SetSchema } from '@colyseus/schema';

import { Colyseus } from 'colyseus-events';

const propertyMetadataKey = Symbol('defectible:propertyMetadata');

export type DefectibleConfig = { normal: number; name: string };
export type DefectibleValue = DefectibleConfig & { value: number; field: string; systemPointer: string };

/**
 * An object that can be decorated with @defectible
 */
export interface DefectibleSystem extends Schema {
    readonly name: string;
    /**
     * is the system offline.
     * should only be updated as result of changes to defectible properties
     */
    readonly broken: boolean;
}
export function defectible(m: DefectibleConfig) {
    return (target: DefectibleSystem, propertyKey: string | symbol) => {
        Reflect.defineMetadata(propertyMetadataKey, m, target, propertyKey);
    };
}

export type System = {
    pointer: string;
    state: DefectibleSystem;
    getStatus: () => 'OFFLINE' | 'DAMAGED' | 'OK';
    defectibles: DefectibleValue[];
};

export function getSystems(root: Schema): System[] {
    const systems: Record<string, System> = {};
    for (const [state, field, value, systemPointer] of allProperties(root)) {
        if (typeof value === 'number') {
            const config = Reflect.getMetadata(propertyMetadataKey, state, field) as DefectibleConfig | undefined;
            if (config) {
                if (!systems[systemPointer]) {
                    const defectibles: DefectibleValue[] = [];
                    systems[systemPointer] = {
                        pointer: systemPointer,
                        state: state as DefectibleSystem,
                        defectibles,
                        getStatus: () => {
                            if ((state as DefectibleSystem).broken) {
                                return 'OFFLINE';
                            }
                            if (
                                defectibles.some((d) => {
                                    const currentValue = state[d.field as keyof typeof state] as unknown as number;
                                    return currentValue !== d.normal;
                                })
                            ) {
                                return 'DAMAGED';
                            }
                            return 'OK';
                        },
                    };
                }
                systems[systemPointer].defectibles.push({ ...config, field, value, systemPointer });
            }
        }
    }
    return Object.values(systems);
}

export const schemaKeys = Object.freeze(Object.keys(new (class extends Schema {})()).concat(['onChange', 'onRemove']));
function* allProperties(state: Colyseus, namespace = ''): IterableIterator<[Schema, string, Colyseus, string]> {
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
                    yield [state, field, value as Colyseus, namespace];
                    yield* allProperties(value as Colyseus, fieldNamespace);
                }
            }
        }
    }
}
