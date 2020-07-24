import { type } from '@colyseus/schema';
import { SpaceObjectBase } from './space-object-base';

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
}
