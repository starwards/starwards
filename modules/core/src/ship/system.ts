/* eslint-disable sort-imports */
import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

import { MAX_SYSTEM_HEAT } from './heat-manager';
import { allColyseusProperties } from '../traverse';
import { DEFECTIBLE_METADATA, commandable, gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';
/* eslint-enable sort-imports */

const defectiblePropertyMetadataKey = DEFECTIBLE_METADATA;

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

    /**
     * Model name for this system instance, configured per ship design
     * (see `modules/core/src/configurations/`). Displayed in the GM
     * tweak panel so players / GM can tell which specific make/model of a
     * system is installed on a ship. Empty string means "not named".
     */
    @gameField('string') modelName = '';

    /**
     * is this system mounted deep inside the hull (protected from surface-effect scrape and
     * from `hitsInternal: false` damage profiles) or externally (hull-mounted, exposed to
     * scrape)? Per-ship (and per-model) design choice; see `SystemState.isInternal`.
     */
    @gameField('boolean') isInternal = false;

    /**
     * is this system vulnerable to Elec (electronic warfare) damage? A per-model design
     * choice, not a physical constant of the system type — see `SystemState.isElectronics`.
     */
    @gameField('boolean') isElectronics = false;

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

export type DefectibleConfig = {
    normal: number;
    name: string;
    /**
     * Whether this defectible is meaningful on `state` at all — e.g. a bearing-skew defectible is
     * meaningless on a mount whose design carries no skew surface (an omni radar). Omitted means
     * always enabled. Evaluated per-instance at collection time (`getSystems`), since the same
     * class (`Radar`) can back both a skew-capable and a skew-free mount depending on its design.
     */
    enabled?: (state: SystemState) => boolean;
};
export type DefectibleValue = DefectibleConfig & { value: number; field: string; systemPointer: string };
export const PowerLevelStep = 0.25;
export enum PowerLevel {
    /** @public used cross-workspace as a computed object key in modules/browser/src/widgets/system-status.ts; knip's per-workspace reference resolution doesn't see it */
    SHUTDOWN = 0,
    /** @public used cross-workspace as a computed object key in modules/browser/src/widgets/system-status.ts; knip's per-workspace reference resolution doesn't see it */
    LOW = PowerLevelStep,
    NORMAL = PowerLevelStep * 2,
    /** @public used cross-workspace as a computed object key in modules/browser/src/widgets/system-status.ts; knip's per-workspace reference resolution doesn't see it */
    HIGH = PowerLevelStep * 3,
    /** @public used cross-workspace as a computed object key in modules/browser/src/widgets/system-status.ts; knip's per-workspace reference resolution doesn't see it */
    MAX = 1,
}
export enum HackLevel {
    /** @public used cross-workspace as a computed object key in modules/browser/src/widgets/system-status.ts; knip's per-workspace reference resolution doesn't see it */
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

    // damage classification. Systems are external by default; internal systems sit deeper
    // and are only hit through exposure or penetration. Both mounting and electronics
    // vulnerability are per-ship-design (really per-model) choices, not physical constants of
    // the system type — see `DesignState.isInternal` / `DesignState.isElectronics`.
    get isInternal(): boolean {
        return this.design.isInternal;
    }
    // vulnerable to Elec (electronic warfare) damage
    get isElectronics(): boolean {
        return this.design.isElectronics;
    }

    @gameField('float32')
    public energyPerMinute = 0;

    /**
     * Set by whatever tried to spend energy on this system's behalf (see `EnergyManager.trySpendEnergy`)
     * the moment the reactor can't cover the draw, and cleared the moment it can again. Lets a system
     * that is otherwise fully intact (not `broken`, no active defect) still show the crew *why* it did
     * nothing this tick — see `getStatus()`.
     */
    @gameField('boolean')
    public energyStarved = false;

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
    public power = PowerLevel.NORMAL;

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
    getStatus: () => 'DISABLED' | 'STARVED' | 'DAMAGED' | 'OK';
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
            if (state.energyStarved) {
                return 'STARVED';
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
                DefectibleConfig | undefined;
            if (config && (config.enabled?.(state) ?? true)) {
                if (!systemsMap[systemPointer]) {
                    systemsMap[systemPointer] = System(systemPointer, state);
                }
                systemsMap[systemPointer].defectibles.push({ ...config, field, value, systemPointer });
            }
        }
    }
    return Object.values(systemsMap);
}
