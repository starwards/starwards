// Damage matrix for the new armor/ammo design (issue #1929).
//
// Pure data + lookups. No Colyseus state, no side effects, no decorators.
// The damage manager / weapon systems can call into this module to translate
// an (ammo, armor) pair into a hull-damage outcome and a system-damage profile.
//
// The matrix below is a verbatim transcription of the "Hull Damage Matrix"
// table in the issue body — keep them in sync if either changes.

export const armorTypes = ['Composite', 'Whipple', 'Hardened', 'Reactive', 'Faraday'] as const;
export type ArmorType = (typeof armorTypes)[number];

export const cannonAmmoTypes = ['CannonHe', 'CannonAp', 'CannonFrag'] as const;
export const missileAmmoTypes = ['MissileHe', 'MissileSabot', 'MissileCluster', 'MissileTandem', 'MissileEmp'] as const;
export const ammoTypes = [...cannonAmmoTypes, ...missileAmmoTypes] as const;
export type CannonAmmoType = (typeof cannonAmmoTypes)[number];
export type MissileAmmoType = (typeof missileAmmoTypes)[number];
export type AmmoType = (typeof ammoTypes)[number];

export type HullOutcome = 'resist' | 'normal' | 'vulnerable' | 'critical' | 'ignores';

const HULL_MATRIX: Readonly<Record<AmmoType, Readonly<Record<ArmorType, HullOutcome>>>> = {
    CannonHe: { Composite: 'normal', Whipple: 'resist', Hardened: 'resist', Reactive: 'resist', Faraday: 'ignores' },
    CannonAp: {
        Composite: 'normal',
        Whipple: 'vulnerable',
        Hardened: 'vulnerable',
        Reactive: 'normal',
        Faraday: 'ignores',
    },
    CannonFrag: { Composite: 'normal', Whipple: 'resist', Hardened: 'resist', Reactive: 'resist', Faraday: 'ignores' },
    MissileHe: { Composite: 'normal', Whipple: 'normal', Hardened: 'resist', Reactive: 'resist', Faraday: 'ignores' },
    MissileSabot: {
        Composite: 'vulnerable',
        Whipple: 'vulnerable',
        Hardened: 'vulnerable',
        Reactive: 'resist',
        Faraday: 'ignores',
    },
    MissileCluster: {
        Composite: 'normal',
        Whipple: 'resist',
        Hardened: 'resist',
        Reactive: 'resist',
        Faraday: 'ignores',
    },
    MissileTandem: {
        Composite: 'vulnerable',
        Whipple: 'vulnerable',
        Hardened: 'normal',
        Reactive: 'critical',
        Faraday: 'ignores',
    },
    MissileEmp: {
        Composite: 'ignores',
        Whipple: 'ignores',
        Hardened: 'ignores',
        Reactive: 'ignores',
        Faraday: 'resist',
    },
};

export function resolveHullOutcome(ammo: AmmoType, armor: ArmorType): HullOutcome {
    return HULL_MATRIX[ammo][armor];
}

// Damage scaling per outcome. "Normal" is the 1.0 baseline.
// "Critical" is intentionally higher than "Vulnerable" — Tandem-vs-Reactive
// is supposed to feel worse than just having no armor at all.
const OUTCOME_MULTIPLIERS: Readonly<Record<HullOutcome, number>> = {
    ignores: 0,
    resist: 0.25,
    normal: 1,
    vulnerable: 2,
    critical: 4,
};

export function damageMultiplierForOutcome(outcome: HullOutcome): number {
    return OUTCOME_MULTIPLIERS[outcome];
}

// Surface-effect ammo (HE / Blast-Frag / Cluster) keeps damaging external
// systems — antennas, sensors, exposed mounts — even when the hull resists.
const SURFACE_EFFECT: ReadonlySet<AmmoType> = new Set<AmmoType>([
    'CannonHe',
    'CannonFrag',
    'MissileHe',
    'MissileCluster',
]);

export function isSurfaceEffectAmmo(ammo: AmmoType): boolean {
    return SURFACE_EFFECT.has(ammo);
}

export function isCannonAmmo(ammo: AmmoType): ammo is CannonAmmoType {
    return (cannonAmmoTypes as readonly string[]).includes(ammo);
}

export function isMissileAmmo(ammo: AmmoType): ammo is MissileAmmoType {
    return (missileAmmoTypes as readonly string[]).includes(ammo);
}

export type SystemDamageScope =
    | 'single-external'
    | 'single-internal'
    | 'multi-external'
    | 'multi-internal'
    | 'multi-electronics';
export type SystemDamageSeverity = 'low' | 'medium' | 'high';

export interface SystemDamageProfile {
    readonly scope: SystemDamageScope;
    readonly severity: SystemDamageSeverity;
}

const SYSTEM_DAMAGE: Readonly<Record<AmmoType, SystemDamageProfile>> = {
    CannonHe: { scope: 'single-external', severity: 'low' },
    CannonAp: { scope: 'single-internal', severity: 'medium' },
    CannonFrag: { scope: 'multi-external', severity: 'low' },
    MissileHe: { scope: 'multi-internal', severity: 'medium' },
    MissileSabot: { scope: 'single-internal', severity: 'high' },
    MissileCluster: { scope: 'multi-external', severity: 'medium' },
    MissileTandem: { scope: 'multi-internal', severity: 'medium' },
    MissileEmp: { scope: 'multi-electronics', severity: 'high' },
};

export function systemDamageProfile(ammo: AmmoType): SystemDamageProfile {
    return SYSTEM_DAMAGE[ammo];
}

// Map the issue's 1-5 stat scale to multipliers applied on top of a baseline
// homing missile profile. Used by projectile design to derive per-missile
// Speed / Range / Maneuver from the design doc table.
export const STAT_SCALE: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = {
    1: 0.4,
    2: 0.7,
    3: 1.0,
    4: 1.3,
    5: 1.6,
};

export interface MissilePerformanceStats {
    readonly speed: 1 | 2 | 3 | 4 | 5;
    readonly range: 1 | 2 | 3 | 4 | 5;
    readonly maneuver: 1 | 2 | 3 | 4 | 5;
}

// Verbatim from the "Missile Performance Stats" table in the issue body.
const MISSILE_STATS: Readonly<Record<MissileAmmoType, MissilePerformanceStats>> = {
    MissileHe: { speed: 3, range: 4, maneuver: 3 },
    MissileSabot: { speed: 5, range: 2, maneuver: 2 },
    MissileCluster: { speed: 3, range: 4, maneuver: 3 },
    MissileTandem: { speed: 2, range: 3, maneuver: 4 },
    MissileEmp: { speed: 4, range: 5, maneuver: 3 },
};

export function missilePerformanceStats(ammo: MissileAmmoType): MissilePerformanceStats {
    return MISSILE_STATS[ammo];
}
