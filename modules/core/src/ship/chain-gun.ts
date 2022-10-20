import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { SmartPilotMode } from './smart-pilot';
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
    @type('float32') bulletsPerSecond = 0;
    @type('float32') bulletSpeed = 0;
    @type('float32') bulletDegreesDeviation = 0;
    @type('float32') maxShellRange = 0;
    @type('float32') minShellRange = 0;
    @type('float32') shellRangeAim = 0;
    @type('float32') explosionRadius = 0;
    @type('float32') explosionExpansionSpeed = 0;
    @type('float32') explosionDamageFactor = 0;
    @type('float32') explosionBlastFactor = 0;
    @type('float32') damage50 = 0;
    @type('float32') completeDestructionProbability = 0;

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
    @type('float32')
    angle = 0;

    @type('boolean')
    isFiring = false;

    @type('float32')
    @range([0, 1])
    cooldown = 0;

    @type('float32')
    @range((t: ChainGun) => [t.design.minShellSecondsToLive, t.design.maxShellSecondsToLive])
    shellSecondsToLive = 0;

    @type('float32')
    @range([-1, 1])
    shellRange = 0; // just used for command, not for firing

    @type('int8')
    shellRangeMode!: SmartPilotMode;

    @type('float32')
    angleOffset = 0;

    @type('uint8')
    cooldownFactor = 1;

    @type(ChaingunDesignState)
    design = new ChaingunDesignState();

    get damage50(): number {
        return this.design.damage50;
    }
    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.cooldownFactor >= 10;
    }
}
