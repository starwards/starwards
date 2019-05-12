import { SpaceObjectBase } from './space-object-base';

export class Asteroid extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase): o is Asteroid {
        return o.type === 'Asteroid';
    }

    public readonly type = 'Asteroid';
}
