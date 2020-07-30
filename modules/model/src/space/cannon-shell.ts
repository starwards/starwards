import { type } from '@colyseus/schema';
import { SpaceObjectBase } from './space-object-base';
import { Explosion } from './explosion';

export class CannonShell extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is CannonShell {
        return o.type === 'CannonShell';
    }

    @type('float32')
    public secondsToLive: number = 0;

    public readonly type = 'CannonShell';

    constructor(public _explosion?: Explosion) {
        super();
        this.health = 10;
        this.radius = 1;
    }
}
