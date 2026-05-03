// Damage matrix for the new armor/ammo design (issue #1929).
//
// Pure data + lookups. No Colyseus state, no side effects, no decorators.
// The damage manager / weapon systems can call into this module to translate
// an (ammo, armor) pair into a hull-damage outcome and a system-damage profile.
//
// The matrix below is a verbatim transcription of the "Hull Damage Matrix"
// table in the issue body — keep them in sync if either changes.

export const armorTypes = ['composite', 'whipple', 'hardened', 'reactive', 'faraday'] as const;
export type ArmorType = (typeof armorTypes)[number];

export const ammoTypes = [
    'cannon-he',
    'cannon-ap',
    'cannon-frag',
    'missile-he',
    'missile-sabot',
    'missile-cluster',
    'missile-tandem',
    'missile-emp',
] as const;
export type AmmoType = (typeof ammoTypes)[number];

export type HullOutcome = 'resist' | 'normal' | 'vulnerable' | 'critical' | 'ignores';

const HULL_MATRIX: Readonly<Record<AmmoType, Readonly<Record<ArmorType, HullOutcome>>>> = {
    'cannon-he': { composite: 'normal', whipple: 'resist', hardened: 'resist', reactive: 'resist', faraday: 'ignores' },
    'cannon-ap': {
        composite: 'normal',
        whipple: 'vulnerable',
        hardened: 'vulnerable',
        reactive: 'normal',
        faraday: 'ignores',
    },
    'cannon-frag': {
        composite: 'normal',
        whipple: 'resist',
        hardened: 'resist',
        reactive: 'resist',
        faraday: 'ignores',
    },
    'missile-he': {
        composite: 'normal',
        whipple: 'normal',
        hardened: 'resist',
        reactive: 'resist',
        faraday: 'ignores',
    },
    'missile-sabot': {
        composite: 'vulnerable',
        whipple: 'vulnerable',
        hardened: 'vulnerable',
        reactive: 'resist',
        faraday: 'ignores',
    },
    'missile-cluster': {
        composite: 'normal',
        whipple: 'resist',
        hardened: 'resist',
        reactive: 'resist',
        faraday: 'ignores',
    },
    'missile-tandem': {
        composite: 'vulnerable',
        whipple: 'vulnerable',
        hardened: 'normal',
        reactive: 'critical',
        faraday: 'ignores',
    },
    'missile-emp': {
        composite: 'ignores',
        whipple: 'ignores',
        hardened: 'ignores',
        reactive: 'ignores',
        faraday: 'resist',
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
    'cannon-he',
    'cannon-frag',
    'missile-he',
    'missile-cluster',
]);

export function isSurfaceEffectAmmo(ammo: AmmoType): boolean {
    return SURFACE_EFFECT.has(ammo);
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
    'cannon-he': { scope: 'single-external', severity: 'low' },
    'cannon-ap': { scope: 'single-internal', severity: 'medium' },
    'cannon-frag': { scope: 'multi-external', severity: 'low' },
    'missile-he': { scope: 'multi-internal', severity: 'medium' },
    'missile-sabot': { scope: 'single-internal', severity: 'high' },
    'missile-cluster': { scope: 'multi-external', severity: 'medium' },
    'missile-tandem': { scope: 'multi-internal', severity: 'medium' },
    'missile-emp': { scope: 'multi-electronics', severity: 'high' },
};

export function systemDamageProfile(ammo: AmmoType): SystemDamageProfile {
    return SYSTEM_DAMAGE[ammo];
}
