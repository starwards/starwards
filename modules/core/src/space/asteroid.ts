import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { type } from '@colyseus/schema';

export class Asteroid extends SpaceObjectBase {
    public static maxSize = 350;
    public static isInstance = (o: unknown): o is Asteroid => {
        return !!o && (o as SpaceObjectBase).type === 'Asteroid';
    };

    public readonly type = 'Asteroid';

    @type('uint16')
    public health = 0;

    constructor() {
        super();
        this.health = 100;
        this.radius = Math.random() * Asteroid.maxSize;
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
