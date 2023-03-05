import 'reflect-metadata';

import { Schema } from '@colyseus/schema';
import { allColyseusProperties } from '../traverse';

const defectiblePropertyMetadataKey = Symbol('defectible:propertyMetadata');

export abstract class DesignState extends Schema {
    keys() {
        return Object.keys(this.$changes.indexes);
    }
}

export type DefectibleConfig = { normal: number; name: string };
export type DefectibleValue = DefectibleConfig & { value: number; field: string; systemPointer: string };

/**
 * An object that can be decorated with @defectible
 */
export interface SystemState extends Schema {
    readonly name: string;
    readonly design: DesignState;
    /**
     * is the system offline.
     * should only be updated as result of changes to defectible properties
     */
    readonly broken: boolean;
    readonly energyPerMinute: number;
    readonly heat: number;
}
export function isSystemState(state: unknown): state is SystemState {
    if (state && state instanceof Schema) {
        const ss = state as SystemState;
        return (
            typeof ss.name === 'string' &&
            typeof ss.broken === 'boolean' &&
            typeof ss.energyPerMinute === 'number' &&
            typeof ss.heat === 'number' &&
            ss.design instanceof DesignState
        );
    }
    return false;
}
export function defectible(config: DefectibleConfig) {
    return (target: SystemState, propertyKey: string | symbol) => {
        Reflect.defineMetadata(defectiblePropertyMetadataKey, config, target, propertyKey);
    };
}

export type System = {
    pointer: string;
    state: SystemState;
    getStatus: () => 'OFFLINE' | 'DAMAGED' | 'OK';
    defectibles: DefectibleValue[];
};

function System(systemPointer: string, state: SystemState): System {
    const defectibles: DefectibleValue[] = [];
    return {
        pointer: systemPointer,
        state: state,
        defectibles,
        getStatus: () => {
            if (state.broken) {
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

export function getSystems(root: Schema): System[] {
    const systemsMap: Record<string, System> = {};
    for (const [state, systemPointer, field, value] of allColyseusProperties(root)) {
        if (isSystemState(state) && typeof value === 'number' && typeof field === 'string') {
            const config = Reflect.getMetadata(defectiblePropertyMetadataKey, state, field) as
                | DefectibleConfig
                | undefined;
            if (config) {
                if (!systemsMap[systemPointer]) {
                    systemsMap[systemPointer] = System(systemPointer, state);
                }
                systemsMap[systemPointer].defectibles.push({ ...config, field, value, systemPointer });
            }
        }
    }
    return Object.values(systemsMap);
}
