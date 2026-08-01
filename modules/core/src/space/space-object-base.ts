import { ArraySchema, Schema } from '@colyseus/schema';
import { commandable, gameField } from '../game-field';

import { Faction } from './faction';
import { RadarSectorValues } from './radar-sector';
import { ScanLevel } from './scan-level';
import { SpaceDamageType } from './damage-profile';
import { SpaceObjects } from '.';
import { Vec2 } from './vec2';
import { XY } from '..';
import { range } from '../range';
import { tweakable } from '../tweakable';

export function compareSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

export function distanceSpaceObjects(a: SpaceObjectBase, b: SpaceObjectBase): number {
    return XY.lengthOf(XY.difference(a.position, b.position)) - a.radius - b.radius;
}

export enum TypeFilter {
    ALL = 0,
    OBJECTS,
    WAYPOINTS,
}

export const filterObject = (f: TypeFilter) => (o: SpaceObjectBase) => {
    switch (f) {
        case TypeFilter.ALL:
            return true;
        case TypeFilter.OBJECTS:
            return o.type !== 'Waypoint';
        case TypeFilter.WAYPOINTS:
            return o.type === 'Waypoint';
    }
};
export abstract class SpaceObjectBase extends Schema {
    public abstract readonly type: keyof SpaceObjects;

    // server-side only (not synced). Harmful object types override this with
    // their damage profile; 'Collision' means plain kinetic collision damage.
    get damageType(): SpaceDamageType {
        return 'Collision';
    }
    @gameField('boolean')
    // @tweakable('boolean')
    public destroyed = false;

    @tweakable('boolean')
    @gameField('boolean')
    public freeze = false;

    @tweakable('boolean')
    @gameField('boolean')
    public expendable = true;

    @gameField('string')
    public id = '';

    @gameField(['uint8'])
    public scanLevels = new ArraySchema<number>(...(Array(Faction.FACTION_COUNT).fill(ScanLevel.UFO) as number[])); // Indexed by Faction enum

    /**
     * Seconds (IterationData.totalSeconds) at which each faction's SNAPSHOT scan level was
     * captured on FULL -> SNAPSHOT demotion. Indexed by Faction enum.
     */
    @gameField(['float32'])
    public scanSnapshotCapturedAt = new ArraySchema<number>(...(Array(Faction.FACTION_COUNT).fill(0) as number[]));

    @gameField(Vec2)
    public position: Vec2 = new Vec2(0, 0);

    @tweakable({ type: 'number', number: { min: 0.05 } })
    @gameField('float32')
    public radius = 0.05;
    @tweakable('vec2')
    @commandable({ '/x': true, '/y': true })
    @gameField(Vec2)
    public velocity: Vec2 = new Vec2(0, 0);

    // default static placeholder for all space obejcts. children can replace with dynamic field.
    public readonly faction: Faction = Faction.NONE;
    /**
     * the vision sectors this object sweeps. Empty for everything that carries no radar.
     */
    public readonly radarSectors: Iterable<RadarSectorValues> = [];

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
    @commandable()
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

    localToGlobal(local: XY) {
        return XY.rotate(local, this.angle);
    }

    get directionAxis() {
        return XY.rotate(XY.one, this.angle - 90);
    }
}
