import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

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
    WARP_FREQUENCY_COUNT,
}
export class WarpDesignState extends DesignState implements WarpDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxProximity = 0;
    @gameField('float32') chargeTime = 0;
    @gameField('float32') dechargeTime = 0;
    @gameField('float32') speedPerLevel = 0;
    @gameField('float32') energyCostPerLevel = 0;
    @gameField('float32') damagePerPhysicalSpeed = 0;
    @gameField('float32') baseDamagePerWarpSpeedPerSecond = 0;
    @gameField('float32') secondsToChangeFrequency = 0;
}
export class Warp extends SystemState {
    public static isInstance = (o: unknown): o is Warp => {
        return (o as Warp)?.type === 'Warp';
    };

    public readonly type = 'Warp';
    public readonly name = 'Warp';

    @gameField(WarpDesignState)
    design = new WarpDesignState();

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'velocity' })
    velocityFactor = 1;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 0, name: 'damage' })
    damageFactor = 0;

    @gameField('float32')
    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    currentLevel = 0;

    @gameField('uint8')
    @range([0, MAX_WARP_LVL])
    @tweakable('number')
    desiredLevel = 0;

    @gameField('int8')
    @tweakable({ type: 'enum', enum: WarpFrequency })
    currentFrequency = WarpFrequency.W770HZ;

    @gameField('int8')
    @tweakable({ type: 'enum', enum: WarpFrequency })
    standbyFrequency = WarpFrequency.W770HZ;

    @range([0, 1])
    @gameField('float32')
    frequencyChange = 1;

    @gameField('boolean')
    jammed = false;

    @gameField('boolean')
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
