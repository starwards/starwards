import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';
import { SpaceObject, XY } from '.';

export class CannonShell extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is CannonShell {
        return o.type === 'CannonShell';
    }

    @type('float32')
    public secondsToLive: number = 0;

    public readonly type = 'CannonShell';

    constructor() {
        super();
        this.health = 10;
        this.radius = 1;
    }

    public collide(other: SpaceObject, _collisionVector: XY, _deltaSeconds: number): void {
        // super.collide(other, collisionVector, deltaSeconds);
        this.destroyed = true;
        other.takeDamage(50);
    }
}
