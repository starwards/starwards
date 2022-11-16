import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type WarpDesign = {
    damage50: number;
    maxProximity: number;
    chargeTime: number;
    dechargeTime: number;
    speedPerLevel: number;
    damagePerSpeed: number;
};

export class WarpDesignState extends DesignState implements WarpDesign {
    @number2Digits damage50 = 0;
    @number2Digits maxProximity = 0;
    @number2Digits damagePerSpeed = 0;
    @number2Digits chargeTime = 0;
    @number2Digits dechargeTime = 0;
    @number2Digits speedPerLevel = 0;
}
export class Warp extends Schema {
    public static isInstance = (o: unknown): o is Warp => {
        return (o as Warp)?.type === 'Warp';
    };

    public readonly type = 'Warp';
    public readonly name = 'Warp';

    @type(WarpDesignState)
    design = new WarpDesignState();

    @type('uint8')
    @range([0, 4])
    @tweakable('number')
    currentLevel = 0;

    @type('uint8')
    @range([0, 4])
    @tweakable('number')
    desiredLevel = 0;
}
