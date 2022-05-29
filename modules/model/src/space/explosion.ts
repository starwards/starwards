import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Explosion extends SpaceObjectBase {
    public static isInstance = (o: SpaceObjectBase): o is Explosion => {
        return o.type === 'Explosion';
    };

    @type('float32')
    public secondsToLive = 0.5;

    /**
     * radius growth speed in meters / seconds
     */
    @type('float32')
    public expansionSpeed = 10;

    /**
     * damage per (second * overlap in meters)
     */
    @type('float32')
    public damageFactor = 20;

    @type('float32')
    public blastFactor = 1;

    public readonly type = 'Explosion';

    constructor() {
        super();
        this.radius = 0.01;
    }
}
