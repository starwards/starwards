import { MapSchema, Schema, type } from '@colyseus/schema';

import { SmartPilotMode } from '.';
import { getConstant } from '../utils';

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
    cooldown = 0;

    @type('float32')
    shellSecondsToLive = 10;

    @type('float32')
    shellRange = 0; // just used for command, not for firing

    @type('int8')
    shellRangeMode!: SmartPilotMode;

    @type('float32')
    angleOffset = 0;

    @type('uint8')
    cooldownFactor = 1;

    @type({ map: 'number' })
    constants!: MapSchema<number>;

    // TODO: move to logic (not part of state)
    get bulletSpeed(): number {
        return getConstant(this, 'bulletSpeed');
    }
    get bulletsPerSecond(): number {
        return getConstant(this, 'bulletsPerSecond');
    }
    get minShellRange(): number {
        return getConstant(this, 'minShellRange');
    }
    get maxShellRange(): number {
        return getConstant(this, 'maxShellRange');
    }
    get shellRangeAim(): number {
        return getConstant(this, 'shellRangeAim');
    }
    get explosionRadius(): number {
        return getConstant(this, 'explosionRadius');
    }
    get explosionExpansionSpeed(): number {
        return getConstant(this, 'explosionExpansionSpeed');
    }
    get explosionDamageFactor(): number {
        return getConstant(this, 'explosionDamageFactor');
    }
    get explosionBlastFactor(): number {
        return getConstant(this, 'explosionBlastFactor');
    }
    get bulletDegreesDeviation(): number {
        return getConstant(this, 'bulletDegreesDeviation');
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
        return getConstant(this, 'damage50');
    }
    get broken(): boolean {
        return (this.angleOffset >= 90 || this.angleOffset <= -90) && this.cooldownFactor >= 10;
    }
}
