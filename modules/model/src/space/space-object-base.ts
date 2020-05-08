import { Schema, type } from '@colyseus/schema';
import { Vec2, XY } from './vec2';
import { SpaceObjects } from '.';

export abstract class SpaceObjectBase extends Schema {
    public static compare(a: SpaceObjectBase, b: SpaceObjectBase): number {
        return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
    }

    /**
     * change position
     */
    public static moveObject(object: SpaceObjectBase, velocity: XY, deltaSeconds: number = 1) {
        object.position.x += velocity.x * deltaSeconds;
        object.position.y += velocity.y * deltaSeconds;
    }

    /**
     * change angle
     */
    public static rotateObject(object: SpaceObjectBase, turnSpeed: number, deltaSeconds: number = 1) {
        object.angle = (360 + object.angle + turnSpeed * deltaSeconds) % 360;
    }

    @type('string')
    public abstract readonly type: keyof SpaceObjects;

    @type('string')
    public id: string = '';
    @type(Vec2)
    public position: Vec2 = new Vec2(0, 0);
    @type('uint16')
    public radius: number = 0;
    @type(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    /*!
     *The direction of the object. (in degrees, 0 is right, 90 is up)
     */
    @type('float32')
    public angle: number = 0;

    /*!
     * [config] Speed of rotation, change of angle in deg/second
     */
    @type('float32')
    public turnSpeed: number = 0;

    init(id: string, position: Vec2, radius: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        return this;
    }
}
