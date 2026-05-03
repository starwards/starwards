import { Faction } from './faction';
import { ShipModel } from '../configurations';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

export class Spaceship extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Spaceship => {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    };
    public static radius = 50;

    @gameField('string')
    public readonly type = 'Spaceship';

    @tweakable({ type: 'enum', enum: Faction })
    @gameField('int8')
    public faction: Faction = Faction.NONE;

    @gameField('float32')
    public radarRange = 0;

    @tweakable('string')
    @gameField('string')
    public model: ShipModel | null = null;

    @tweakable('string')
    @gameField('string')
    public callsign = '';

    @tweakable('boolean')
    @gameField('boolean')
    public transponderOpen = true;

    constructor() {
        super();
        this.radius = Spaceship.radius;
    }

    init(id: string, position: Vec2, shipModel: ShipModel, faction: Faction): this {
        this.id = id;
        this.position = position;
        this.model = shipModel;
        this.faction = faction;
        if (!this.callsign) {
            this.callsign = id;
        }
        return this;
    }
}
