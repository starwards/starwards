import { Craft } from '../logic';
import { Explosion } from './explosion';
import { ShipDirection } from '../ship';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { getKeys } from '../utils';
import { number2Digits } from '../number-field';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';

// currently projectiles config is hard-coded. should move to a more dynamic solution in the future.
// when adding new Projectile types, also add relevent fields to the Magazine and chaingun systems

export const projectileDesigns = {
    CannonShell: {
        name: 'cannon shell',
        radius: 1,
        homing: null,
        explosion: {
            secondsToLive: 1,
            expansionSpeed: 100,
            damageFactor: 20,
            blastFactor: 1,
        },
    },
    BlastCannonShell: {
        name: 'blast cannon shell',
        radius: 1,
        homing: null,
        explosion: {
            secondsToLive: 1,
            expansionSpeed: 200,
            damageFactor: 5,
            blastFactor: 5,
        },
    },
    Missile: {
        name: 'missile',
        radius: 2,
        homing: {
            secondsToLive: 60,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            proximityDetonation: 100,
        },
        explosion: {
            secondsToLive: 0.5,
            expansionSpeed: 1_000,
            damageFactor: 50,
            blastFactor: 1,
        },
    },
} as const;

export const projectileModels = getKeys(projectileDesigns);
export type ProjectileModel = keyof typeof projectileDesigns;
export type ProjectileDesign = typeof projectileDesigns[ProjectileModel];

export class Projectile extends SpaceObjectBase implements Craft {
    public static isInstance = (o: unknown): o is Projectile => {
        return !!o && (o as SpaceObjectBase).type === 'Projectile';
    };

    @number2Digits
    @tweakable({ type: 'number', number: { min: 0.01 } })
    public secondsToLive = 0;

    public readonly type = 'Projectile';
    @type('uint16')
    public health = 10;
    public _explosion?: Explosion;

    @type('string')
    @tweakable('string')
    public targetId: string | null = null;

    @type('string')
    @tweakable({ type: 'string enum', enum: projectileModels })
    public model: ProjectileModel = 'CannonShell';

    constructor(model?: ProjectileModel) {
        super();
        if (model) {
            this.model = model;
            this._explosion = new Explosion();
            this._explosion.assign(this.design.explosion);
            this.radius = this.design.radius;
        }
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }

    get design() {
        return projectileDesigns[this.model];
    }

    get capacity() {
        return 1 + 1 / Math.min(this.secondsToLive, 0.2);
    }

    get maxSpeed() {
        return this.capacity * (this.design.homing?.maxSpeed || 0);
    }

    get rotationCapacity() {
        return this.capacity * (this.design.homing?.rotationCapacity || 0);
    }

    velocityCapacity(_: ShipDirection): number {
        return this.capacity * (this.design.homing?.velocityCapacity || 0);
    }
}
