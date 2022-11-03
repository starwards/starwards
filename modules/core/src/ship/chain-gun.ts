import { DesignState, defectible } from './system';
import { ProjectileModel, projectileModels } from '../space/projectile';
import { Schema, type } from '@colyseus/schema';

import { SmartPilotMode } from './smart-pilot';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type SelectedProjectileModel = 'None' | ProjectileModel;
export const selectedProjectileModels = ['None', ...projectileModels] as const;

export type ChaingunDesign = {
    bulletsPerSecond: number;
    bulletSpeed: number;
    bulletDegreesDeviation: number;
    maxShellRange: number;
    minShellRange: number;
    overrideSecondsToLive: number;
    damage50: number;
    useCannonShell?: boolean;
};

export class ChaingunDesignState extends DesignState implements ChaingunDesign {
    @number2Digits bulletsPerSecond = 0;
    @number2Digits bulletSpeed = 0;
    @number2Digits bulletDegreesDeviation = 0;
    @number2Digits maxShellRange = 0;
    @number2Digits minShellRange = 0;
    @number2Digits overrideSecondsToLive = -1;
    @number2Digits damage50 = 0;
    @type('boolean') useCannonShell = false;

    // get explosionSecondsToLive(): number {
    //     return this.explosionRadius / this.explosionExpansionSpeed;
    // }
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

    public readonly type: string = 'ChainGun';
    get name() {
        return 'Chain gun';
    }
    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @number2Digits
    @range(shipDirectionRange)
    angle = 0;

    @tweakable('boolean')
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
    @defectible({ normal: 0, name: 'direction offset' })
    @range([-90, 90])
    angleOffset = 0;

    @number2Digits
    @range([0, 1])
    @defectible({ normal: 1, name: 'rate of fire' })
    rateOfFireFactor = 1;

    @type('string')
    @tweakable({ type: 'string enum', enum: selectedProjectileModels })
    projectile: SelectedProjectileModel = 'None';

    @type(ChaingunDesignState)
    design = new ChaingunDesignState();

    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.rateOfFireFactor <= 0;
    }
}
