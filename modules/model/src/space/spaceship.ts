import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObjectBase {
    public static isInstance(o: unknown): o is Spaceship {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    }
    public static radius = 50;
    public readonly type = 'Spaceship';

    @type('string')
    public targetId: string | null = null;

    constructor() {
        super();
        this.health = 1000;
        this.radius = Spaceship.radius;
    }
}
