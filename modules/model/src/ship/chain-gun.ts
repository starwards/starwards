import { MapSchema, Schema, type } from '@colyseus/schema';

import { SmartPilotMode } from '.';

export class ChainGun extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

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

    // TODO: move to logic (not part of state)
    get bulletSpeed(): number {
        return this.constants.get('bulletSpeed');
    }
    get bulletsPerSecond(): number {
        return this.constants.get('bulletsPerSecond');
    }
    get minShellRange(): number {
        return this.constants.get('minShellRange');
    }
    get maxShellRange(): number {
        return this.constants.get('maxShellRange');
    }
    get explosionRadius(): number {
        return this.constants.get('explosionRadius');
    }
    get explosionExpansionSpeed(): number {
        return this.constants.get('explosionExpansionSpeed');
    }
    get explosionDamageFactor(): number {
        return this.constants.get('explosionDamageFactor');
    }
    get explosionBlastFactor(): number {
        return this.constants.get('explosionBlastFactor');
    }
    get bulletDegreesDeviation(): number {
        return this.constants.get('bulletDegreesDeviation');
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
}
