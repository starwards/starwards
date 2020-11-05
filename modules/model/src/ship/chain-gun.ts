import { Schema, type, MapSchema } from '@colyseus/schema';

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

    get bulletSpeed(): number {
        return this.constants.get('bulletSpeed');
    }
    get bulletsPerSecond(): number {
        return this.constants.get('bulletsPerSecond');
    }
    get minShellSecondsToLive(): number {
        return this.constants.get('minShellSecondsToLive');
    }
    get maxShellSecondsToLive(): number {
        return this.constants.get('maxShellSecondsToLive');
    }
    get explosionSecondsToLive(): number {
        return this.constants.get('explosionSecondsToLive');
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
}
