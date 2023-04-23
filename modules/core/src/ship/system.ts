import 'reflect-metadata';

import { MAX_SYSTEM_HEAT } from './heat-manager';
import { Schema } from '@colyseus/schema';
import { allColyseusProperties } from '../traverse';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

const defectiblePropertyMetadataKey = Symbol('defectible:propertyMetadata');

export abstract class DesignState extends Schema {
    keys() {
        return Object.keys(this.$changes.indexes);
    }
}

export type DefectibleConfig = { normal: number; name: string };
export type DefectibleValue = DefectibleConfig & { value: number; field: string; systemPointer: string };
export const PowerLevelStep = 0.25;
export enum PowerLevel {
    SHUTDOWN = 0,
    LOW = PowerLevelStep,
    MID = PowerLevelStep * 2,
    HIGH = PowerLevelStep * 3,
    MAX = 1,
}
export enum HackLevel {
    DISABLED = 0,
    COMPROMISED = 0.5,
    OK = 1,
}
/**
 * An object that can be decorated with @defectible
 */
export abstract class SystemState extends Schema {
    abstract readonly name: string;
    abstract readonly design: DesignState;
    /**
     * is the system offline.
     * should only be updated as result of changes to defectible properties
     */
    abstract readonly broken: boolean;

    @number2Digits
    public energyPerMinute = 0;

    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @number2Digits
    public heat = 0;

    @range([0, 1])
    @tweakable('number')
    @number2Digits
    public coolantFactor = 0;

    @range([0, 1])
    @tweakable({ type: 'enum', enum: PowerLevel })
    @number2Digits
    public power = PowerLevel.MAX;

    @range([0, 1])
    @tweakable({ type: 'enum', enum: HackLevel })
    @number2Digits
    public hacked = HackLevel.OK;

    public get effectiveness() {
        return this.broken ? 0 : this.power * this.hacked;
    }
}

export function defectible(config: DefectibleConfig) {
    return (target: SystemState, propertyKey: string | symbol) => {
        Reflect.defineMetadata(defectiblePropertyMetadataKey, config, target, propertyKey);
    };
}

export type System = {
    pointer: string;
    state: SystemState;
    getStatus: () => 'DISABLED' | 'DAMAGED' | 'OK';
    getHeatStatus: () => 'OVERHEAT' | 'WARMING' | 'OK';
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
                return 'DISABLED';
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
        getHeatStatus: () => {
            if (state.heat >= MAX_SYSTEM_HEAT) {
                return 'OVERHEAT';
            }
            if (state.heat >= MAX_SYSTEM_HEAT / 2) {
                return 'WARMING';
            }
            return 'OK';
        },
    };
}

export function getSystems(root: Schema): System[] {
    const systemsMap: Record<string, System> = {};
    for (const [state, systemPointer, field, value] of allColyseusProperties(root)) {
        if (state && state instanceof SystemState && typeof value === 'number' && typeof field === 'string') {
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
