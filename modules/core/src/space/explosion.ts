import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { number2Digits } from '../number-field';

export class Explosion extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Explosion => {
        return !!o && (o as SpaceObjectBase).type === 'Explosion';
    };

    @number2Digits
    public secondsToLive = 0.5;

    /**
     * radius growth speed in meters / seconds
     */
    @number2Digits
    public expansionSpeed = 10;

    /**
     * damage per (second * overlap in meters)
     */
    @number2Digits
    public damageFactor = 20;

    @number2Digits
    public blastFactor = 1;

    public readonly type = 'Explosion';

    constructor() {
        super();
        this.radius = 0.01;
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
