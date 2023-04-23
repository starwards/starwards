import { DesignState, SystemState, defectible } from './system';

import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';

export type WarpDesign = {
    damage50: number;
    maxProximity: number;
    chargeTime: number;
    dechargeTime: number;
    speedPerLevel: number;
    energyCostPerLevel: number;
    damagePerPhysicalSpeed: number;
    baseDamagePerWarpSpeedPerSecond: number;
    secondsToChangeFrequency: number;
};

export const MAX_WARP_LVL = 4;
export enum WarpFrequency {
    W770HZ,
    W780HZ,
    W790HZ,
    W800HZ,
    W810HZ,
}
export class WarpDesignState extends DesignState implements WarpDesign {
    @number2Digits damage50 = 0;
    @number2Digits maxProximity = 0;
    @number2Digits chargeTime = 0;
    @number2Digits dechargeTime = 0;
    @number2Digits speedPerLevel = 0;
    @number2Digits energyCostPerLevel = 0;
    @number2Digits damagePerPhysicalSpeed = 0;
    @number2Digits baseDamagePerWarpSpeedPerSecond = 0;
    @number2Digits secondsToChangeFrequency = 0;
}
export class Warp extends SystemState {
    public static isInstance = (o: unknown): o is Warp => {
        return (o as Warp)?.type === 'Warp';
    };

    public readonly type = 'Warp';
    public readonly name = 'Warp';

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

    @type('int8')
    @tweakable({ type: 'enum', enum: WarpFrequency })
    currentFrequency = WarpFrequency.W770HZ;

    @type('int8')
    @tweakable({ type: 'enum', enum: WarpFrequency })
    standbyFrequency = WarpFrequency.W770HZ;

    @range([0, 1])
    @type('float32')
    frequencyChange = 1;

    @type('boolean')
    jammed = false;

    @type('boolean')
    changingFrequency = false;

    // server only, used for commands
    @tweakable('boolean')
    public levelUpCommand = false;
    @tweakable('boolean')
    public levelDownCommand = false;
    @tweakable('boolean')
    public changeFrequencyCommand = false;

    get damagePerWarpSpeedPerSecond() {
        return this.damageFactor * this.design.baseDamagePerWarpSpeedPerSecond;
    }

    get broken() {
        return this.damageFactor >= 1 || this.velocityFactor <= 0;
    }
}
