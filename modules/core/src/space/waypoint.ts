import { Faction } from './faction';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export class Waypoint extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Waypoint => {
        return !!o && (o as SpaceObjectBase).type === 'Waypoint';
    };

    @gameField('string')
    public readonly type = 'Waypoint';

    public readonly isCorporal = false;
    public freeze = true;

    @tweakable({ type: 'enum', enum: Faction })
    @gameField('int8')
    public faction: Faction = Faction.NONE;

    @tweakable('shipId')
    @gameField('string')
    public owner: string | null = null;

    @tweakable('string')
    @gameField('string')
    public collection = '';

    @tweakable('string')
    @gameField('string')
    public title = '';

    @tweakable('number')
    @range([0x000000, 0xffffff])
    @gameField('uint32')
    public color = 0xffffff;

    /** Whether this waypoint is shown on the pilot station radar. Set from the relay station. */
    @tweakable('boolean')
    @gameField('boolean')
    public visibleToPilot = true;

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
