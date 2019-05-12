import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Spaceship {
        return o.type === 'Spaceship';
    }

    public readonly type = 'Spaceship';

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
