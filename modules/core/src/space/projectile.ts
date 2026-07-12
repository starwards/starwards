import { Craft } from '../logic';
import { DamageType } from './damage-profile';
import { Explosion } from './explosion';
import { ShipDirection } from '../ship';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
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

// how the damage arrives at the ship (damage-model spec §3). impact = the round must
// physically hit the ship (contact fuze); exactly one damage event at the contact point.
// explosion = detonation into a growing blast; one damage event per tick while overlapping.
export const deliveries = ['impact', 'explosion'] as const;
export type Delivery = (typeof deliveries)[number];

export interface WarheadDesign {
    damageType: DamageType;
    delivery: Delivery;
    // defect rolls per target per damage event (damage-model spec §4). default 1.
    concentration: number;
    // flat damage for a single impact event (spec §8 "Damage" column). ignored by explosion.
    impactDamage: number;
    explosion: {
        secondsToLive: number;
        expansionSpeed: number;
        damageFactor: number;
        blastFactor: number;
    };
}

export interface ProjectileDesign extends WarheadDesign {
    name: string;
    radius: number;
    heatPerShot: number;
    homing: null | {
        secondsToLive: number;
        rotationCapacity: number;
        velocityCapacity: number;
        maxSpeed: number;
        proximityDetonation: number;
    };
    // selectable warheads (cluster munitions): overrides damageType + explosion per mode
    warheads?: Record<ClusterWarheadMode, WarheadDesign>;
}

export interface MissileDesign extends ProjectileDesign {
    homing: NonNullable<ProjectileDesign['homing']>;
}

export const projectileDesigns = {
    HiExpShell: {
        name: '30mm HiExp shell',
        radius: 1,
        damageType: 'HiExp',
        delivery: 'explosion',
        concentration: 1,
        impactDamage: 0,
        heatPerShot: 5,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 200, damageFactor: 20, blastFactor: 2 },
    },
    ArmPenShell: {
        name: '30mm ArmPen shell',
        radius: 1,
        damageType: 'ArmPen',
        delivery: 'impact',
        concentration: 1,
        impactDamage: 30,
        heatPerShot: 5,
        homing: null,
        explosion: { secondsToLive: 0.5, expansionSpeed: 80, damageFactor: 30, blastFactor: 1 },
    },
    FragShell: {
        name: '30mm Frag shell',
        radius: 1,
        damageType: 'Frag',
        delivery: 'explosion',
        concentration: 1,
        impactDamage: 0,
        heatPerShot: 5,
        homing: null,
        explosion: { secondsToLive: 1, expansionSpeed: 250, damageFactor: 10, blastFactor: 4 },
    },
    HiExpMissile: {
        name: 'HiExp missile',
        radius: 2,
        damageType: 'HiExp',
        delivery: 'explosion',
        concentration: 1,
        impactDamage: 0,
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            proximityDetonation: 100,
        },
        // sharp 350m blast (blast size = expansionSpeed * secondsToLive)
        explosion: { secondsToLive: 0.35, expansionSpeed: 1_000, damageFactor: 50, blastFactor: 1 },
    },
    ArmPenMissile: {
        name: 'ArmPen missile',
        radius: 2,
        damageType: 'ArmPen',
        delivery: 'impact',
        concentration: 8,
        impactDamage: 60,
        heatPerShot: 25,
        homing: {
            secondsToLive: 42,
            rotationCapacity: 504,
            velocityCapacity: 960,
            maxSpeed: 960,
            proximityDetonation: 100,
        },
        // tight 200m instant punch
        explosion: { secondsToLive: 0.25, expansionSpeed: 800, damageFactor: 80, blastFactor: 0.5 },
    },
    FragMissile: {
        name: 'Frag missile',
        radius: 2,
        damageType: 'Frag',
        delivery: 'explosion',
        concentration: 1,
        impactDamage: 0,
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            proximityDetonation: 100,
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
        concentration: 1,
        impactDamage: 0,
        heatPerShot: 25,
        homing: {
            secondsToLive: 78,
            rotationCapacity: 720,
            velocityCapacity: 600,
            maxSpeed: 600,
            proximityDetonation: 100,
        },
        explosion: { secondsToLive: 1, expansionSpeed: 750, damageFactor: 10, blastFactor: 1 },
        warheads: {
            // big lingering 750m shrapnel cloud — sands external systems over a large area
            Frag: {
                damageType: 'Frag',
                delivery: 'explosion',
                concentration: 1,
                impactDamage: 0,
                explosion: { secondsToLive: 1, expansionSpeed: 750, damageFactor: 10, blastFactor: 1 },
            },
            // focused submunitions: impact delivery, but multi-scope (the carrier penetrates and its
            // bomblets pepper every internal in the struck area — spec §5 exception)
            ArmPen: {
                damageType: 'ArmPen',
                delivery: 'impact',
                concentration: 3,
                impactDamage: 30,
                explosion: { secondsToLive: 0.4, expansionSpeed: 1_000, damageFactor: 40, blastFactor: 0.5 },
            },
        },
    },
    TandemMissile: {
        name: 'Tandem missile',
        radius: 2,
        damageType: 'Tandem',
        delivery: 'impact',
        concentration: 5,
        impactDamage: 50,
        heatPerShot: 25,
        homing: {
            secondsToLive: 60,
            rotationCapacity: 936,
            velocityCapacity: 420,
            maxSpeed: 420,
            proximityDetonation: 100,
        },
        // focused 300m — the delivery mechanism is the point
        explosion: { secondsToLive: 0.3, expansionSpeed: 1_000, damageFactor: 60, blastFactor: 1 },
    },
    ElecMissile: {
        name: 'Elec missile',
        radius: 2,
        damageType: 'Elec',
        delivery: 'impact',
        concentration: 1,
        impactDamage: 25,
        heatPerShot: 25,
        homing: {
            secondsToLive: 96,
            rotationCapacity: 720,
            velocityCapacity: 780,
            maxSpeed: 780,
            proximityDetonation: 100,
        },
        // focused 300m — the delivery mechanism is the point
        explosion: { secondsToLive: 0.3, expansionSpeed: 1_000, damageFactor: 5, blastFactor: 1 },
    },
} as const satisfies Record<AmmoType, ProjectileDesign | MissileDesign>;

export const projectileModels = Object.keys(projectileDesigns) as readonly AmmoType[];
export type ProjectileModel = AmmoType;

export function isShellAmmo(ammo: AmmoType): ammo is ShellAmmoType {
    return projectileDesigns[ammo].homing === null;
}

export function isMissileAmmo(ammo: AmmoType): ammo is MissileAmmoType {
    return projectileDesigns[ammo].homing !== null;
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

    @tweakable({ type: 'string enum', enum: projectileModels })
    @gameField('string')
    public model: ProjectileModel = 'HiExpShell';

    // warhead mode for cluster munitions — ignored by single-warhead designs.
    // Can be switched until detonation; the explosion is built from the mode in effect.
    @tweakable({ type: 'string enum', enum: clusterWarheadModes })
    @gameField('string')
    public warhead: ClusterWarheadMode = 'Frag';

    constructor(model?: ProjectileModel) {
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
        return projectileDesigns[this.model];
    }

    get warheadDesign(): WarheadDesign {
        return this.design.warheads?.[this.warhead] ?? this.design;
    }

    get damageType(): DamageType {
        return this.warheadDesign.damageType;
    }

    get delivery(): Delivery {
        return this.warheadDesign.delivery;
    }

    get concentration(): number {
        return this.warheadDesign.concentration;
    }

    get impactDamage(): number {
        return this.warheadDesign.impactDamage;
    }

    makeExplosion(): Explosion {
        if (this._explosion) {
            return this._explosion;
        }
        const explosion = new Explosion();
        explosion.assign(this.warheadDesign.explosion);
        explosion.damageType = this.warheadDesign.damageType;
        explosion.concentration = this.warheadDesign.concentration;
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
