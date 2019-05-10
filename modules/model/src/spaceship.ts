import { SpaceObject } from './space-object';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObject {
    /*!
     *The direction of the ship. (in degrees, 0 is right, 90 is up)
     */
    @type('float32')
    public angle: number = 0;

    /*!
     * [config] Speed of rotation, change of angle in deg/second
     */
    @type('float32')
    public turnSpeed: number = 0;
}
