import { AmmoType, MissileAmmoType, STAT_SCALE, missilePerformanceStats } from '../logic/damage-matrix';

import { Craft } from '../logic';
import { Explosion } from './explosion';
import { ShipDirection } from '../ship';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

// Projectile designs are derived from the issue #1929 design doc:
//   - 3 cannon shells (HE, AP, Blast/Frag)
//   - 5 guided missiles (HE, SABOT, Cluster, Tandem, EMP)
// Per-missile Speed / Range / Maneuver come from the "Missile Performance
// Stats" table; the 1-5 stats are scaled into concrete game values via
// STAT_SCALE so the table stays the source of truth.

interface CannonDesign {
    name: string;
    radius: number;
    homing: null;
    explosion: {
        secondsToLive: number;
        expansionSpeed: number;
        damageFactor: number;
        blastFactor: number;
    };
}

interface MissileDesign {
    name: string;
    radius: number;
    homing: {
        secondsToLive: number;
        rotationCapacity: number;
        velocityCapacity: number;
        maxSpeed: number;
        proximityDetonation: number;
    };
    explosion: {
        secondsToLive: number;
        expansionSpeed: number;
        damageFactor: number;
        blastFactor: number;
    };
}

const BASE_MISSILE_SPEED = 600;
const BASE_MISSILE_SECONDS_TO_LIVE = 60;
const BASE_MISSILE_ROTATION = 720;
const BASE_MISSILE_VELOCITY_CAPACITY = 600;

function makeMissileDesign(ammo: MissileAmmoType, name: string, damageFactor: number, blastFactor = 1): MissileDesign {
    const stats = missilePerformanceStats(ammo);
    return {
        name,
        radius: 2,
        homing: {
            secondsToLive: BASE_MISSILE_SECONDS_TO_LIVE * STAT_SCALE[stats.range],
            rotationCapacity: BASE_MISSILE_ROTATION * STAT_SCALE[stats.maneuver],
            velocityCapacity: BASE_MISSILE_VELOCITY_CAPACITY * STAT_SCALE[stats.speed],
            maxSpeed: BASE_MISSILE_SPEED * STAT_SCALE[stats.speed],
            proximityDetonation: 100,
        },
        explosion: {
            secondsToLive: 0.5,
            expansionSpeed: 1_000,
            damageFactor,
            blastFactor,
        },
    };
}

export const projectileDesigns = {
    // --- 30mm cannons ---
    CannonHe: {
        name: '30mm HE shell',
        radius: 1,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 200, damageFactor: 20, blastFactor: 2 },
    },
    CannonAp: {
        name: '30mm AP shell',
        radius: 1,
        homing: null,
        explosion: { secondsToLive: 0.5, expansionSpeed: 80, damageFactor: 30, blastFactor: 1 },
    },
    CannonFrag: {
        name: '30mm Blast/Frag shell',
        radius: 1,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 250, damageFactor: 10, blastFactor: 4 },
    },
    // --- guided missiles ---
    MissileHe: makeMissileDesign('MissileHe', 'HE missile', 50, 1),
    MissileSabot: makeMissileDesign('MissileSabot', 'SABOT missile', 80, 0.5),
    MissileCluster: makeMissileDesign('MissileCluster', 'Cluster missile', 30, 4),
    MissileTandem: makeMissileDesign('MissileTandem', 'Tandem missile', 60, 1),
    MissileEmp: makeMissileDesign('MissileEmp', 'EMP missile', 5, 1),
} as const satisfies Record<AmmoType, CannonDesign | MissileDesign>;

export const projectileModels = Object.keys(projectileDesigns) as readonly AmmoType[];
export type ProjectileModel = AmmoType;
export type ProjectileDesign = (typeof projectileDesigns)[ProjectileModel];

export class Projectile extends SpaceObjectBase implements Craft {
    public static isInstance = (o: unknown): o is Projectile => {
        return !!o && (o as SpaceObjectBase).type === 'Projectile';
    };

    @gameField('float32')
    public secondsToLive = 0;

    @gameField('string')
    public readonly type = 'Projectile';

    @gameField('uint16')
    public health = 10;
    public _explosion?: Explosion;

    /**
     * Id of the ship that fired this projectile. Empty string for projectiles
     * not fired from a ship (e.g. test fixtures, GM-spawned).
     */
    @gameField('string')
    public shipId = '';

    @tweakable('string')
    @gameField('string')
    public targetId: string | null = null;

    @tweakable({ type: 'string enum', enum: projectileModels })
    @gameField('string')
    public model: ProjectileModel = 'CannonHe';

    constructor(model?: ProjectileModel) {
        super();
        if (model) {
            this.model = model;
            this._explosion = new Explosion();
            this._explosion.assign(this.design.explosion);
            this._explosion.ammoType = model;
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

    get ammoType(): AmmoType {
        return this.model;
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
