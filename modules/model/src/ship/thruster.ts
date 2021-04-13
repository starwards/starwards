import { MapSchema, Schema, type } from '@colyseus/schema';

export class Thruster extends Schema {
    @type({ map: 'number' })
    constants!: MapSchema<number>;

    /*!
     *The direction of the thruster in relation to the ship. (in degrees, 0 is front)
     */
    @type('float32')
    angle = 0;
}
