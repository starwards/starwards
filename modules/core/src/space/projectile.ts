import { Craft } from '../logic';
import { Explosion } from './explosion';
import { ShipDirection } from '../ship';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { WeaponDamageType } from './damage-profile';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

export const shellAmmoTypes = ['HiExpShell', 'ArmPenShell', 'FragShell'] as const;
export const missileAmmoTypes = [
    'HiExpMissile',
    'ArmPenMissile',
    'FragMissile',
    'ClusterMissile',
    'TandemMissile',
    'ElecMissile',
] as const;
export const ammoTypes = [...shellAmmoTypes, ...missileAmmoTypes] as const;
export type ShellAmmoType = (typeof shellAmmoTypes)[number];
export type MissileAmmoType = (typeof missileAmmoTypes)[number];
export type AmmoType = (typeof ammoTypes)[number];

export const clusterWarheadModes = ['Frag', 'ArmPen'] as const;
export type ClusterWarheadMode = (typeof clusterWarheadModes)[number];

// contact: a single damage event at the point of impact, no explosion object.
// proximity: detonates into a growing Explosion, either on approach to a target
// (within `range`) or on contact — also the backup time-fuze on lifetime expiry.
export type Fuze = { type: 'contact' } | { type: 'proximity'; range: number };

// the fuze decides the delivery: contact rounds are impact delivery and carry a flat
// damage number; proximity rounds are explosion delivery and carry a blast block
export type DamageDelivery = 'impact' | 'explosion';

export type WarheadDesign = { damageType: WeaponDamageType } & (
    | {
          delivery: 'impact';
          fuze: { type: 'contact' };
          damage: number;
      }
    | {
          delivery: 'explosion';
          fuze: { type: 'proximity'; range: number };
          explosion: {
              secondsToLive: number;
              expansionSpeed: number;
              damageFactor: number;
              blastFactor: number;
          };
      }
);

// how far a warhead's blast reaches; impact rounds have no blast
export function blastRadius(warhead: WarheadDesign): number {
    return warhead.delivery === 'explosion' ? warhead.explosion.secondsToLive * warhead.explosion.expansionSpeed : 0;
}

export type ProjectileDesign = WarheadDesign & {
    name: string;
    radius: number;
    heatPerShot: number;
    homing: null | {
        secondsToLive: number;
        rotationCapacity: number;
        velocityCapacity: number;
        maxSpeed: number;
        /** terminal sprint: dramatic acceleration burst once within `range` of the target */
        sprint: {
            range: number;
            speedMultiplier: number;
        };
    };
    // selectable warheads (cluster munitions): overrides the whole warhead per mode
    warheads?: Record<ClusterWarheadMode, WarheadDesign>;
};

export type MissileDesign = ProjectileDesign & {
    homing: NonNullable<ProjectileDesign['homing']>;
};

// design decision (bridge testplay 2026-08-09): every missile sprints once within 3km of
// its target, defeating leisurely maneuvering solutions in the terminal phase
const TERMINAL_SPRINT = { range: 3_000, speedMultiplier: 2.5 } as const;

export const ammoDesigns = {
    HiExpShell: {
        name: '30mm HiExp shell',
        radius: 1,
        damageType: 'HiExp',
        delivery: 'explosion',
        fuze: { type: 'proximity', range: 100 },
        heatPerShot: 5,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 200, damageFactor: 20, blastFactor: 2 },
    },
    ArmPenShell: {
        name: '30mm ArmPen shell',
        radius: 1,
        damageType: 'ArmPen',
        delivery: 'impact',
        fuze: { type: 'contact' },
        heatPerShot: 5,
        homing: null,
        // anti-armor jab: its power is plate erosion (2x vs Composite), system damage stays occasional
        damage: 30,
    },
    FragShell: {
        name: '30mm Frag shell',
        radius: 1,
        damageType: 'Frag',
        delivery: 'explosion',
        fuze: { type: 'proximity', range: 100 },
        heatPerShot: 5,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 250, damageFactor: 10, blastFactor: 4 },
    },
    HiExpMissile: {
        name: 'HiExp missile',
        radius: 2,
        damageType: 'HiExp',
        delivery: 'explosion',
        fuze: { type: 'proximity', range: 100 },
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            sprint: TERMINAL_SPRINT,
        },
        // sharp 350m blast (blast size = expansionSpeed * secondsToLive)
        explosion: { secondsToLive: 0.35, expansionSpeed: 1_000, damageFactor: 50, blastFactor: 1 },
    },
    ArmPenMissile: {
        name: 'ArmPen missile',
        radius: 2,
        damageType: 'ArmPen',
        delivery: 'impact',
        fuze: { type: 'contact' },
        heatPerShot: 25,
        homing: {
            secondsToLive: 42,
            rotationCapacity: 504,
            velocityCapacity: 960,
            maxSpeed: 960,
            sprint: TERMINAL_SPRINT,
        },
        // the assassin: a big amount that spills into a burst of defect rolls on one victim
        damage: 60,
    },
    FragMissile: {
        name: 'Frag missile',
        radius: 2,
        damageType: 'Frag',
        delivery: 'explosion',
        fuze: { type: 'proximity', range: 100 },
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            sprint: TERMINAL_SPRINT,
        },
        // dedicated shrapnel warhead. All frag warheads share the same intensity (damageFactor 10);
        // the missile's edge over the cluster frag mode is size and time: an 800m cloud lingering 1.6s
        explosion: { secondsToLive: 1.6, expansionSpeed: 500, damageFactor: 10, blastFactor: 1 },
    },
    ClusterMissile: {
        name: 'Cluster missile',
        radius: 2,
        // default warhead mode; the tube can switch modes before launch
        damageType: 'Frag',
        delivery: 'explosion',
        fuze: { type: 'proximity', range: 100 },
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            sprint: TERMINAL_SPRINT,
        },
        explosion: { secondsToLive: 1, expansionSpeed: 750, damageFactor: 10, blastFactor: 1 },
        warheads: {
            // big lingering 750m shrapnel cloud — sands external systems over a large area
            Frag: {
                damageType: 'Frag',
                delivery: 'explosion',
                fuze: { type: 'proximity', range: 100 },
                explosion: { secondsToLive: 1, expansionSpeed: 750, damageFactor: 10, blastFactor: 1 },
            },
            // focused submunitions — the carrier penetrates and its bomblets pepper every
            // internal system in the struck area; shares its per-event numbers with ArmPenShell
            ArmPen: {
                damageType: 'ArmPen',
                delivery: 'impact',
                fuze: { type: 'contact' },
                damage: 30,
            },
        },
    },
    TandemMissile: {
        name: 'Tandem missile',
        radius: 2,
        damageType: 'Tandem',
        delivery: 'impact',
        fuze: { type: 'contact' },
        heatPerShot: 25,
        homing: {
            secondsToLive: 60,
            rotationCapacity: 936,
            velocityCapacity: 420,
            maxSpeed: 420,
            sprint: TERMINAL_SPRINT,
        },
        // ArmPen's slightly weaker sibling — its value is the armor matchups
        damage: 50,
    },
    ElecMissile: {
        name: 'Elec missile',
        radius: 2,
        damageType: 'Elec',
        delivery: 'impact',
        fuze: { type: 'contact' },
        heatPerShot: 25,
        homing: {
            secondsToLive: 96,
            rotationCapacity: 720,
            velocityCapacity: 780,
            maxSpeed: 780,
            sprint: TERMINAL_SPRINT,
        },
        // one dart, one discharge — every electronics system ship-wide rolls once
        damage: 25,
    },
} as const satisfies Record<AmmoType, ProjectileDesign | MissileDesign>;

export function isShellAmmo(ammo: AmmoType): ammo is ShellAmmoType {
    return ammoDesigns[ammo].homing === null;
}

export function isMissileAmmo(ammo: AmmoType): ammo is MissileAmmoType {
    return ammoDesigns[ammo].homing !== null;
}

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
    // manual override for the detonation explosion (tests/GM); normally built
    // from the warhead design at detonation time — see makeExplosion()
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

    @tweakable({ type: 'string enum', enum: ammoTypes })
    @gameField('string')
    public model: AmmoType = 'HiExpShell';

    // warhead mode for cluster munitions — ignored by single-warhead designs.
    // Can be switched until detonation; the explosion is built from the mode in effect.
    @tweakable({ type: 'string enum', enum: clusterWarheadModes })
    @gameField('string')
    public warhead: ClusterWarheadMode = 'Frag';

    constructor(model?: AmmoType) {
        super();
        if (model) {
            this.model = model;
            this.radius = this.design.radius;
        }
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }

    get design(): ProjectileDesign {
        return ammoDesigns[this.model];
    }

    get warheadDesign(): WarheadDesign {
        return this.design.warheads?.[this.warhead] ?? this.design;
    }

    get damageType(): WeaponDamageType {
        return this.warheadDesign.damageType;
    }

    get fuze(): Fuze {
        return this.warheadDesign.fuze;
    }

    get delivery(): DamageDelivery {
        return this.warheadDesign.delivery;
    }

    makeExplosion(): Explosion {
        if (this._explosion) {
            return this._explosion;
        }
        const warhead = this.warheadDesign;
        if (warhead.delivery !== 'explosion') {
            throw new Error(`contact-fuzed warhead ${this.model} resolves as an impact, not an explosion`);
        }
        const explosion = new Explosion();
        explosion.assign(warhead.explosion);
        explosion.damageType = warhead.damageType;
        explosion.isShellBlast = isShellAmmo(this.model);
        return explosion;
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
