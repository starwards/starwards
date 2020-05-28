import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Missile extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Missile {
        return o.type === 'Missile';
    }

    @type('float32')
    public timeToLive: number = 0;

    public readonly type = 'Missile';
}
