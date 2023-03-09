import { DesignState, SystemState, defectible } from './system';

import { EPSILON } from '../logic';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';

export enum DockingMode {
    DOCKED,
    UNDOCKED,
    DOCKING,
    UNDOCKING,
}

export type DockingDesign = {
    damage50: number;
    maxDockingDistance: number;
    maxDockedDistance: number;
    undockingTargetDistance: number;
    angle: number;
    width: number;
};

export class DockingDesignState extends DesignState implements DockingDesign {
    @number2Digits damage50 = 0;
    @number2Digits maxDockingDistance = 0;
    @number2Digits maxDockedDistance = 0;
    @number2Digits undockingTargetDistance = 0;
    @number2Digits angle = 0;
    @number2Digits width = 0;
}
export class Docking extends SystemState {
    public static isInstance = (o: unknown): o is Docking => {
        return (o as Docking)?.type === 'Docking';
    };

    public readonly type = 'Docking';
    public readonly name = 'Docking';

    @type(DockingDesignState)
    design = new DockingDesignState();

    @type('int8')
    @tweakable({ type: 'enum', enum: DockingMode })
    mode: DockingMode = DockingMode.UNDOCKED;

    @type('string')
    @tweakable('string')
    public targetId = '';

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'range' })
    rangesFactor = 1;

    // server only, used for commands
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
}
