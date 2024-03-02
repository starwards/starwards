import { Faction } from './faction';
import { Schema } from '@colyseus/schema';
import { SpaceObjects } from '.';
import { Vec2 } from './vec2';
import { XY } from '..';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export function compareSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

export function distanceSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return XY.lengthOf(XY.difference(a.position, b.position)) - a.radius - b.radius;
}
export abstract class SpaceObjectBase extends Schema {
    public abstract readonly type: keyof SpaceObjects;
    @gameField('boolean')
    // @tweakable('boolean')
    public destroyed = false;

    @tweakable('boolean')
    @gameField('boolean')
    public freeze = false;

    @gameField('string')
    public id = '';
    @gameField(Vec2)
    public position: Vec2 = new Vec2(0, 0);

    @tweakable({ type: 'number', number: { min: 0.05 } })
    @gameField('float32')
    public radius = 0.05;
    @gameField(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    // default static placeholder for all space obejcts. children can replace with dynamic field.
    public readonly faction: Faction = Faction.NONE;
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
    @gameField('float32')
    public angle = 0;

    /*!
     * [config] Speed of rotation, change of angle in deg/second
     */
    @tweakable({ type: 'number' })
    @gameField('float32')
    public turnSpeed = 0;

    // can later add globalToLocalPosition, globalToLocalVelocity etc.
    globalToLocal(global: XY) {
        return XY.rotate(global, -this.angle);
    }

    get directionAxis() {
        return XY.rotate(XY.one, this.angle - 90);
    }
}
