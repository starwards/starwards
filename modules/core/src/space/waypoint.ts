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

    @gameField('int8')
    @tweakable({ type: 'enum', enum: Faction })
    public faction: Faction = Faction.NONE;

    @gameField('string')
    @tweakable('shipId')
    public owner: string | null = null;

    @gameField('string')
    @tweakable('string')
    public collection = '';

    @gameField('string')
    @tweakable('string')
    public title = '';

    @gameField('uint32')
    @tweakable('number')
    @range([0x000000, 0xffffff])
    public color = 0xffffff;

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
