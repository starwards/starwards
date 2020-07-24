import { type } from '@colyseus/schema';
import { SpaceObjectBase } from './space-object-base';

export class Explosion extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Explosion {
        return o.type === 'Explosion';
    }

    @type('float32')
    public secondsToLive: number = 0.5;

    /**
     * radius growth speed in meters / seconds
     */
    @type('float32')
    public expansionSpeed: number = 10;

    /**
     * damage per (second * overlap in meters)
     */
    @type('float32')
    public damageFactor: number = 20;

    @type('float32')
    public blastFactor: number = 1;

    public readonly type = 'Explosion';

    constructor() {
        super();
        this.health = 1;
        this.radius = 0.1;
    }
}
