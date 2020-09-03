import { Schema, type, MapSchema } from '@colyseus/schema';

export class ChainGun extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /*!
     *The direction of the gun in relation to the ship. (in degrees, 0 is front)
     */
    @type('float32')
    angle: number = 0;

    @type('boolean')
    isFiring = false;

    @type('float32')
    cooldown = 0;

    @type('float32')
    shellSecondsToLive = 10;

    get bulletSpeed(): number {
        return this.constants.bulletSpeed;
    }

    get bulletDegreesDeviation(): number {
        return this.constants.bulletDegreesDeviation;
    }

    get explosionSecondsToLive(): number {
        return this.constants.explosionSecondsToLive;
    }

    get explosionExpansionSpeed(): number {
        return this.constants.explosionExpansionSpeed;
    }

    get explosionDamageFactor(): number {
        return this.constants.explosionDamageFactor;
    }

    get explosionBlastFactor(): number {
        return this.constants.explosionBlastFactor;
    }
}
