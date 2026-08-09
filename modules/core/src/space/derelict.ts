import { Faction } from './faction';
import { ShipModel } from '../configurations';
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

    /** Inherited from the source ship at derelict creation, so the radar blip keeps that ship's silhouette. */
    @gameField('string')
    public model: ShipModel | null = null;

    init(
        id: string,
        position: Vec2,
        radius: number,
        faction: Faction,
        callsign: string,
        angle: number,
        model: ShipModel | null = null,
    ): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        this.faction = faction;
        this.callsign = callsign;
        this.angle = angle;
        this.model = model;
        return this;
    }
}
