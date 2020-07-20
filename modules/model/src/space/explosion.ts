import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';
import { SpaceObject, XY, Vec2 } from '.';

export class Explosion extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Explosion {
        return o.type === 'Explosion';
    }

    @type('float32')
    public secondsToLive: number = 0.5;

    /**
     * damage per (second * overlap in meters)
     */
    @type('float32')
    public damageFactor: number = 5;

    @type('float32')
    public blastFactor: number = 1;

    public readonly type = 'Explosion';

    constructor() {
        super();
        this.health = 1;
        this.radius = 1;
    }

    public collide(_o: SpaceObject, _v: XY, _d: number): void {
        // nothing happens to the explosion on colission
    }
    public takeDamage(_: number) {
        // explosion can't be damaged
    }

    public collideOtherOverride = (other: SpaceObject, collisionVector: XY, deltaSeconds: number) => {
        const exposure = deltaSeconds * XY.lengthOf(collisionVector) * 2;

        other.health -= this.damageFactor * exposure;
        Vec2.add(other.velocity, XY.scale(collisionVector, this.blastFactor * exposure), other.velocity);
    };
}
