import { DesignState } from './system';
import { Schema } from '@colyseus/schema';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

export type TargetingDesign = {
    maxRange: number;
    shortRange: number;
};
export class TargetingDesignState extends DesignState implements TargetingDesign {
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
    public enemyOnly = false;

    @tweakable('boolean')
    @gameField('boolean')
    public shortRangeOnly = false;

    @gameField(TargetingDesignState)
    design = new TargetingDesignState();

    // server only, used for commands
    public nextTargetCommand = false;
    public prevTargetCommand = false;
    public clearTargetCommand = false;

    get range() {
        return this.shortRangeOnly ? this.design.shortRange : this.design.maxRange;
    }
}
