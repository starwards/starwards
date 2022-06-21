import { Faction } from './faction';
import { ShipModel } from '../configurations';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { type } from '@colyseus/schema';

export class Spaceship extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Spaceship => {
        return !!o && (o as SpaceObjectBase).type === 'Spaceship';
    };
    public static radius = 50;
    public readonly type = 'Spaceship';

    @type('string')
    public targetId: string | null = null;

    @type('int8')
    public faction: Faction = Faction.none;

    @type('float32')
    public radarRange = 0;

    @type('string')
    public model: ShipModel | null = null;

    constructor() {
        super();
        this.radius = Spaceship.radius;
    }

    init(id: string, position: Vec2, shipModel: ShipModel): this {
        this.id = id;
        this.position = position;
        this.model = shipModel;
        return this;
    }
}
