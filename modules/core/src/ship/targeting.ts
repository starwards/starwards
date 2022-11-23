import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { tweakable } from '../tweakable';

export type TargetingDesign = {
    maxRange: number;
    shortRange: number;
};
export class TargetingDesignState extends DesignState implements TargetingDesign {
    @type('uint32')
    maxRange = 0;
    @type('uint32')
    shortRange = 0;
}

export class Targeting extends Schema {
    @type('string')
    @tweakable('string')
    public targetId: string | null = null;

    @type('boolean')
    @tweakable('boolean')
    public shipOnly = false;

    @type('boolean')
    @tweakable('boolean')
    public enemyOnly = false;

    @type('boolean')
    @tweakable('boolean')
    public shortRangeOnly = false;

    @type(TargetingDesignState)
    design = new TargetingDesignState();

    // server only, used for commands
    public nextTargetCommand = false;
    public prevTargetCommand = false;
    public clearTargetCommand = false;

    get range() {
        return this.shortRangeOnly ? this.design.shortRange : this.design.maxRange;
    }
}
