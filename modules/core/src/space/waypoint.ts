import { Faction } from './faction';
import { SpaceObjectBase } from './space-object-base';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';

export class Waypoint extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Waypoint => {
        return !!o && (o as SpaceObjectBase).type === 'Waypoint';
    };

    public readonly type = 'Waypoint';
    public freeze = true;

    @type('int8')
    @tweakable({ type: 'enum', enum: Faction })
    public faction: Faction = Faction.none;

    @type('string')
    @tweakable('string')
    public owner: string | null = null;

    @type('string')
    @tweakable('string')
    public collection = '';

    @type('uint32')
    public color = 0xffffff;
}
