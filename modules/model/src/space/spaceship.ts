import { SpaceObjectBase } from './space-object-base';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObjectBase {
    public static isInstance(o: unknown): o is Spaceship {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    }

    public readonly type = 'Spaceship';

    @type('string')
    public targetId: string | null = null;

    // server only, used for commands
    public nextTargetCommand = false;
    public rotationModeCommand = false;
    public maneuveringModeCommand = false;

    constructor() {
        super();
        this.health = 1000;
        this.radius = 50;
    }
}
