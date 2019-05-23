import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObjectBase {
    public static isInstance(o: SpaceObjectBase | undefined): o is Spaceship {
        return !!o && o.type === 'Spaceship';
    }

    public readonly type = 'Spaceship';
}
