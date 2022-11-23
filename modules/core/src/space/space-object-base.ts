import { Schema, type } from '@colyseus/schema';

import { Faction } from './faction';
import { SpaceObjects } from '.';
import { Vec2 } from './vec2';
import { XY } from '..';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export function compareSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

export function distanceSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return XY.lengthOf(XY.difference(a.position, b.position)) - a.radius - b.radius;
}
export abstract class SpaceObjectBase extends Schema {
    @type('string')
    public abstract readonly type: keyof SpaceObjects;
    @type('boolean')
    // @tweakable('boolean')
    public destroyed = false;

    @tweakable('boolean')
    @type('boolean')
    public freeze = false;

    @type('string')
    public id = '';
    @type(Vec2)
    public position: Vec2 = new Vec2(0, 0);

    @tweakable({ type: 'number', number: { min: 0.05 } })
    @number2Digits
    public radius = 0.05;
    @type(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    // default static placeholder for all space obejcts. children can replace with dynamic field.
    public readonly faction: Faction = Faction.none;
    public readonly radarRange: number = 0;
    /**
     * how much collision overlap turns into velocity (0-1)
     */
    public readonly collisionElasticity: number = 0.05;
    /**
     * how much collision overlap turns into damage to self (0-1)
     */
    public readonly collisionDamage: number = 0.5;

    public readonly isCorporal: boolean = true;
    /*!
     *The direction of the object. (in degrees, 0 is right, 90 is up)
     */
    @tweakable('number')
    @range([0, 360])
    @number2Digits
    public angle = 0;

    /*!
     * [config] Speed of rotation, change of angle in deg/second
     */
    @tweakable({ type: 'number' })
    @number2Digits
    public turnSpeed = 0;

    // can later add globalToLocalPosition, globalToLocalVelocity etc.
    globalToLocal(global: XY) {
        return XY.rotate(global, -this.angle);
    }

    get directionAxis() {
        return XY.rotate(XY.one, this.angle - 90);
    }
}
