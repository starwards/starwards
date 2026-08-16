import { SpaceDamageType } from './damage-profile';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';

export class Explosion extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Explosion => {
        return !!o && (o as SpaceObjectBase).type === 'Explosion';
    };

    @gameField('float32')
    public secondsToLive = 0.5;

    /**
     * radius growth speed in meters / seconds
     */
    @gameField('float32')
    public expansionSpeed = 10;

    /**
     * damage per (second * overlap in meters)
     */
    @gameField('float32')
    public damageFactor = 20;

    @gameField('float32')
    public blastFactor = 1;

    /**
     * Set once this blast lands a hit on an armor section that was already fully broken —
     * drives the distinct hull-penetration render on the client.
     */
    @gameField('boolean')
    public breachHit = false;

    /**
     * Id of the ship whose projectile detonated into this explosion. Empty for
     * GM-spawned/test explosions. Carried onto blast-overlap Damage events so a hit can be
     * credited to the shooter regardless of delivery type — see SpaceManager.registerHit.
     */
    @gameField('string')
    public shipId = '';

    @gameField('string')
    public readonly type = 'Explosion';

    // server-side only. 'Collision' (e.g. GM-spawned explosions) means a generic
    // hit handled by the flat-damage path.
    private _damageType: SpaceDamageType = 'Collision';

    get damageType(): SpaceDamageType {
        return this._damageType;
    }

    set damageType(value: SpaceDamageType) {
        this._damageType = value;
    }

    constructor() {
        super();
        this.radius = 0.01;
    }

    init(id: string, position: Vec2, damageFactor: number): this {
        this.id = id;
        this.position = position;
        this.damageFactor = damageFactor;
        return this;
    }
}
