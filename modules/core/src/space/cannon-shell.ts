import { Explosion } from './explosion';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { number2Digits } from '../number-field';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';
export class CannonShell extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is CannonShell => {
        return !!o && (o as SpaceObjectBase).type === 'CannonShell';
    };

    @number2Digits
    @tweakable({ type: 'number', number: { min: 0.01 } })
    public secondsToLive = 0;

    public readonly type = 'CannonShell';
    @type('uint16')
    public health = 0;

    constructor(public _explosion?: Explosion) {
        super();
        this.health = 10;
        this.radius = 1;
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
