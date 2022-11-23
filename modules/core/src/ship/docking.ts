import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { number2Digits } from '../number-field';
import { tweakable } from '../tweakable';

export enum DockingMode {
    DOCKED,
    UNDOCKED,
    DOCKING,
    UNDOCKING,
}

export type DockingDesign = {
    damage50: number;
};

export class DockingDesignState extends DesignState implements DockingDesign {
    @number2Digits damage50 = 0;
}
export class Docking extends Schema {
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

    get broken() {
        return false;
    }
}
