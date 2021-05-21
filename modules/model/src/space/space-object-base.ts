import { Schema, type } from '@colyseus/schema';

import { Faction } from './faction';
import { SpaceObjects } from '.';
import { Vec2 } from './vec2';
import { XY } from '..';

export function compareSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}
export abstract class SpaceObjectBase extends Schema {
    @type('string')
    public abstract readonly type: keyof SpaceObjects;
    @type('boolean')
    public destroyed = false;
    @type('boolean')
    public freeze = false;

    @type('string')
    public id = '';
    @type(Vec2)
    public position: Vec2 = new Vec2(0, 0);
    @type('float32')
    public radius = 0;
    @type(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    // default placeholder for all space obejcts. children can replace with dynamic field.
    public readonly faction: Faction = Faction.none;

    /*!
     *The direction of the object. (in degrees, 0 is right, 90 is up)
     */
    @type('float32')
    public angle = 0;

    /*!
     * [config] Speed of rotation, change of angle in deg/second
     */
    @type('float32')
    public turnSpeed = 0;

    @type('uint16')
    public health = 0;

    // can later add globalToLocalPosition, globalToLocalVelocity etc.
    globalToLocal(global: XY) {
        return XY.rotate(global, -this.angle);
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }

    get directionAxis() {
        return XY.rotate(XY.one, this.angle - 90);
    }
}
