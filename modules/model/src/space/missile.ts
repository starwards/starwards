import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';
import { SpaceObject, XY } from '.';

export class Missile extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Missile {
        return o.type === 'Missile';
    }

    @type('float32')
    public secondsToLive: number = 0;

    public readonly type = 'Missile';

    constructor() {
        super();
        this.health = 10;
        this.radius = 1;
    }

    public collide(other: SpaceObject, _collisionVector: XY, _deltaSeconds: number): void {
        // super.collide(other, collisionVector, deltaSeconds);
        this.destroyed = true;
        other.health -= 50;
    }
}
