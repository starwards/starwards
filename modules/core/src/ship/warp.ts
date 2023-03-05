import { DesignState, defectible } from './system';
import { Schema, type } from '@colyseus/schema';

import { MAX_SYSTEM_HEAT } from './heat-manager';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type WarpDesign = {
    damage50: number;
    maxProximity: number;
    chargeTime: number;
    dechargeTime: number;
    speedPerLevel: number;
    damagePerPhysicalSpeed: number;
    baseDamagePerWarpSpeedPerSecond: number;
};

export const MAX_WARP_LVL = 4;
export class WarpDesignState extends DesignState implements WarpDesign {
    @number2Digits damage50 = 0;
    @number2Digits maxProximity = 0;
    @number2Digits chargeTime = 0;
    @number2Digits dechargeTime = 0;
    @number2Digits speedPerLevel = 0;
    @number2Digits damagePerPhysicalSpeed = 0;
    @number2Digits baseDamagePerWarpSpeedPerSecond = 0;
}
export class Warp extends Schema {
    public static isInstance = (o: unknown): o is Warp => {
        return (o as Warp)?.type === 'Warp';
    };

    public readonly type = 'Warp';
    public readonly name = 'Warp';

    @number2Digits
    public energyPerMinute = 0;

    @range([0, MAX_SYSTEM_HEAT])
    @tweakable('number')
    @number2Digits
    public heat = 0;

    @type(WarpDesignState)
    design = new WarpDesignState();

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'velocity' })
    velocityFactor = 1;

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 0, name: 'damage' })
    damageFactor = 0;

    @type('float32')
    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    currentLevel = 0;

    @type('uint8')
    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    desiredLevel = 0;

    // server only, used for commands
    public levelUpCommand = false;
    public levelDownCommand = false;

    get damagePerWarpSpeedPerSecond() {
        return this.damageFactor * this.design.baseDamagePerWarpSpeedPerSecond;
    }

    get broken() {
        return this.damageFactor >= 1 || this.velocityFactor <= 0;
    }
}
