/* eslint-disable sort-imports */
import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

import { MAX_SYSTEM_HEAT } from './heat-manager';
import { allColyseusProperties } from '../traverse';
import { commandable, gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';
/* eslint-enable sort-imports */

const defectiblePropertyMetadataKey = Symbol('defectible:propertyMetadata');

export abstract class DesignState extends Schema {
    /**
     * Static marker consumed by `isCommandable` in `modules/core/src/game-field.ts`.
     * JavaScript class statics are inherited through `extends`, so every
     * concrete DesignState subclass (`ReactorDesignState`, `ChaingunDesignState`,
     * …) carries this marker for free, and the GM design-state panel can
     * write any field on any subclass through the JSON Pointer surface.
     *
     * This is a static marker (not an import of `DesignState` into
     * `game-field.ts`) to avoid a dependency cycle: `range.ts` imports from
     * `json-ptr.ts`, and `ship/system.ts` imports from `../range` and
     * `../game-field`, so any `json-ptr → ship/system` or
     * `game-field → ship/system` edge would close a cycle.
     */
    static readonly isStarwardsDesignState = true;

    keys() {
        // In Colyseus schema v3, use Symbol.metadata to access schema property definitions
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
        const metadata = (this.constructor as any)[Symbol.metadata];
        const keys: string[] = [];
        for (const index in metadata) {
            const field = metadata[index] as any;
            if (!field.deprecated && field.name) {
                keys.push(field.name);
            }
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
        return keys;
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

    @gameField('float32')
    public energyPerMinute = 0;

    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @gameField('float32')
    public heat = 0;

    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    public coolantFactor = 0;

    @range([0, 1])
    @tweakable({ type: 'enum', enum: PowerLevel })
    @commandable()
    @gameField('float32')
    public power = PowerLevel.MAX;

    @range([0, 1])
    @tweakable({ type: 'enum', enum: HackLevel })
    @gameField('float32')
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
