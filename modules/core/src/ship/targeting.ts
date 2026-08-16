import { commandable, gameField } from '../game-field';

import { DesignState } from './system';
import { Schema } from '@colyseus/schema';
import { tweakable } from '../tweakable';

export type TargetingDesign = {
    modelName?: string;
    maxRange: number;
    shortRange: number;
};
class TargetingDesignState extends DesignState implements TargetingDesign {
    @gameField('uint32')
    maxRange = 0;
    @gameField('uint32')
    shortRange = 0;
}

export class Targeting extends Schema {
    @tweakable('string')
    @gameField('string')
    public targetId: string | null = null;

    @tweakable('boolean')
    @gameField('boolean')
    public shipOnly = false;

    @tweakable('boolean')
    @gameField('boolean')
    public enemyOnly = true;

    @tweakable('boolean')
    @gameField('boolean')
    public shortRangeOnly = false;

    @gameField(TargetingDesignState)
    design = new TargetingDesignState();

    // server only, used for commands
    @commandable()
    public nextTargetCommand = false;
    @commandable()
    public prevTargetCommand = false;
    @commandable()
    public clearTargetCommand = false;

    get range() {
        return this.shortRangeOnly ? this.design.shortRange : this.design.maxRange;
    }
}
