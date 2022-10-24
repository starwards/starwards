import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { SmartPilotMode } from './smart-pilot';
import { defectible } from '../defectible';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type ChaingunDesign = {
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    shellRangeAim: number;
    explosionRadius: number;
    explosionExpansionSpeed: number;
    explosionDamageFactor: number;
    explosionBlastFactor: number;
    damage50: number;
    completeDestructionProbability: number;
};

export class ChaingunDesignState extends DesignState implements ChaingunDesign {
    @number2Digits bulletsPerSecond = 0;
    @number2Digits bulletSpeed = 0;
    @number2Digits bulletDegreesDeviation = 0;
    @number2Digits maxShellRange = 0;
    @number2Digits minShellRange = 0;
    @number2Digits shellRangeAim = 0;
    @number2Digits explosionRadius = 0;
    @number2Digits explosionExpansionSpeed = 0;
    @number2Digits explosionDamageFactor = 0;
    @number2Digits explosionBlastFactor = 0;
    @number2Digits damage50 = 0;
    @number2Digits completeDestructionProbability = 0;

    get explosionSecondsToLive(): number {
        return this.explosionRadius / this.explosionExpansionSpeed;
    }
    get minShellSecondsToLive(): number {
        return this.minShellRange / this.bulletSpeed;
    }
    get maxShellSecondsToLive(): number {
        return this.maxShellRange / this.bulletSpeed;
    }
}
export class ChainGun extends Schema {
    public static isInstance = (o: unknown): o is ChainGun => {
        return (o as ChainGun)?.type === 'ChainGun';
    };

    public readonly type = 'ChainGun';
    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @number2Digits
    angle = 0;

    @type('boolean')
    isFiring = false;

    @number2Digits
    @range([0, 1])
    cooldown = 0;

    @number2Digits
    @range((t: ChainGun) => [t.design.minShellSecondsToLive, t.design.maxShellSecondsToLive])
    shellSecondsToLive = 0;

    @number2Digits
    @range([-1, 1])
    shellRange = 0; // just used for command, not for firing

    @type('int8')
    shellRangeMode!: SmartPilotMode;

    @number2Digits
    @defectible({ normal: 0, name: 'angle deviates' })
    angleOffset = 0;

    @type('uint8')
    cooldownFactor = 1;

    @type(ChaingunDesignState)
    design = new ChaingunDesignState();

    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.cooldownFactor >= 10;
    }
}
