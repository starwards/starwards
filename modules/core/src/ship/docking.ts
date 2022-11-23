import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { number2Digits } from '../number-field';

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

    get broken() {
        return false;
    }
}
