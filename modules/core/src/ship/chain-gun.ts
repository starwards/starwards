import { Schema, type } from '@colyseus/schema';

import { ChaingunModel } from './ship-configuration';
import { ModelParams } from '../model-params';
import { SmartPilotMode } from '.';
import { range } from '../range';

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
    @range((t: ChainGun) => [t.minShellSecondsToLive, t.maxShellSecondsToLive])
    shellSecondsToLive = 10;

    @type('float32')
    @range([-1, 1])
    shellRange = 0; // just used for command, not for firing

    @type('int8')
    shellRangeMode!: SmartPilotMode;

    @type('float32')
    angleOffset = 0;

    @type('uint8')
    cooldownFactor = 1;

    @type(ModelParams)
    modelParams!: ModelParams<keyof ChaingunModel>;

    get bulletSpeed(): number {
        return this.modelParams.get('bulletSpeed');
    }
    get bulletsPerSecond(): number {
        return this.modelParams.get('bulletsPerSecond');
    }
    get minShellRange(): number {
        return this.modelParams.get('minShellRange');
    }
    get maxShellRange(): number {
        return this.modelParams.get('maxShellRange');
    }
    get shellRangeAim(): number {
        return this.modelParams.get('shellRangeAim');
    }
    get explosionRadius(): number {
        return this.modelParams.get('explosionRadius');
    }
    get explosionExpansionSpeed(): number {
        return this.modelParams.get('explosionExpansionSpeed');
    }
    get explosionDamageFactor(): number {
        return this.modelParams.get('explosionDamageFactor');
    }
    get explosionBlastFactor(): number {
        return this.modelParams.get('explosionBlastFactor');
    }
    get bulletDegreesDeviation(): number {
        return this.modelParams.get('bulletDegreesDeviation');
    }
    get explosionSecondsToLive(): number {
        return this.explosionRadius / this.explosionExpansionSpeed;
    }
    get minShellSecondsToLive(): number {
        return this.minShellRange / this.bulletSpeed;
    }
    get maxShellSecondsToLive(): number {
        return this.maxShellRange / this.bulletSpeed;
    }
    // damage ammount at which there's 50% chance of system damage
    get damage50(): number {
        return this.modelParams.get('damage50');
    }
    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.cooldownFactor >= 10;
    }
}
