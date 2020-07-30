import { Schema, type, MapSchema } from '@colyseus/schema';

export class AutoCannon extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /*!
     *The direction of the cannon in relation to the ship. (in degrees, 0 is front)
     */
    @type('float32')
    angle: number = 0;

    @type('boolean')
    isFiring = false;

    @type('float32')
    cooldown = 0;

    @type('float32')
    shellSecondsToLive = 10;
}
