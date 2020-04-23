import { SpaceObjectBase } from './space-object-base';

export class Spaceship extends SpaceObjectBase {
    public static isInstance(o: any): o is Spaceship {
        return !!o && o.type === 'Spaceship';
    }

    public readonly type = 'Spaceship';
}
