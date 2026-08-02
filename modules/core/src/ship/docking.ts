import { DesignState, SystemState, defectible } from './system';
import { commandable, gameField } from '../game-field';

import { EPSILON } from '../logic';
import { range } from '../range';
import { tweakable } from '../tweakable';

export enum DockingMode {
    DOCKED,
    UNDOCKED,
    DOCKING,
    UNDOCKING,
}

export type DockingDesign = {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    damage50: number;
    maxDockingDistance: number;
    maxDockedDistance: number;
    undockingTargetDistance: number;
    angle: number;
    width: number;
};

export class DockingDesignState extends DesignState implements DockingDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxDockingDistance = 0;
    @gameField('float32') maxDockedDistance = 0;
    @gameField('float32') undockingTargetDistance = 0;
    @gameField('float32') angle = 0;
    @gameField('float32') width = 0;
}
export class Docking extends SystemState {
    public static isInstance = (o: unknown): o is Docking => {
        return (o as Docking)?.type === 'Docking';
    };

    public readonly type = 'Docking';
    public readonly name = 'Docking';

    @gameField(DockingDesignState)
    design = new DockingDesignState();

    @tweakable({ type: 'enum', enum: DockingMode })
    @gameField('int8')
    mode: DockingMode = DockingMode.UNDOCKED;

    @tweakable('string')
    @gameField('string')
    public targetId = '';

    @range([0, 1])
    @defectible({ normal: 1, name: 'range' })
    @gameField('float32')
    rangesFactor = 1;

    // server only, used for commands
    @commandable()
    public toggleCommand = false;

    get maxDockingDistance() {
        return this.design.maxDockingDistance * this.rangesFactor;
    }

    get maxDockedDistance() {
        return this.design.maxDockedDistance * this.rangesFactor;
    }

    get broken(): boolean {
        return this.rangesFactor <= EPSILON;
    }

    /** Whether this ship currently qualifies for the `docked` repair tier (see `configurations/repair-protocols.ts`). */
    get isDocked(): boolean {
        return this.mode === DockingMode.DOCKED;
    }
}
