import { SpaceObjectBase } from './space-object-base';

export class Asteroid extends SpaceObjectBase {
    public static maxSize = 350;
    public static isInstance(o: SpaceObjectBase): o is Asteroid {
        return o.type === 'Asteroid';
    }

    public readonly type = 'Asteroid';

    constructor() {
        super();
        this.health = 100;
        this.radius = Math.random() * Asteroid.maxSize;
    }
}
