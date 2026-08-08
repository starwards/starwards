import { Faction } from './faction';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';

export class Derelict extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Derelict => {
        return !!o && (o as SpaceObjectBase).type === 'Derelict';
    };

    @gameField('string')
    public readonly type = 'Derelict';

    @gameField('int8')
    public faction: Faction = Faction.NONE;

    @gameField('string')
    public callsign = '';

    init(id: string, position: Vec2, radius: number, faction: Faction, callsign: string, angle: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        this.faction = faction;
        this.callsign = callsign;
        this.angle = angle;
        return this;
    }
}
