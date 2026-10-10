import { WeaponDamageType } from '../space/damage-profile';

// per-damage-type stats are mapped from DamageType, so adding a damage type
// fails compilation on every armor model until it takes a stance on it
export type ArmorModelStats = {
    // multiplier on plate erosion per damage type. 0 = the armor does not engage the hit.
    // System damage is never scaled by this — once plates break (or penetration applies), the round's own damage goes through.
    [T in WeaponDamageType as `plateDamage_${T}`]: number;
} & {
    // fraction (0..1) of system damage that bypasses the plates regardless of plate state.
    // When the armor does not engage a type (plateDamage 0), only 0 (blocked) or 1 (full bypass)
    // are meaningful — fractional penetration applies to engaging hits only (validated in armor-models.spec).
    [T in WeaponDamageType as `penetration_${T}`]: number;
};

// plateDamage: multiplier on plate erosion only, 0 = armor does not engage the hit.
// The armor is worn down until its plates are dead; system damage behind it is never scaled.
// penetration: fraction of system damage bypassing the plates.
// Surface-effect ammo (HiExp/Frag) always scrapes hull-mounted systems regardless of the armor
// model — the equipment sits outside the plates. Frag shrapnel clouds never penetrate plates.

export const compositeArmor: ArmorModelStats = {
    plateDamage_HiExp: 1,
    // penetrators are composite's weakness — armor-piercing rounds chew it double-speed
    plateDamage_ArmPen: 2,
    // frag never interacts with armor plates (any model) — its damage is the surface scrape only
    plateDamage_Frag: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Elec: 1,
};

export const whippleArmor: ArmorModelStats = {
    // the standoff screen defeats most of the blast — massed high-explosive fire remains a very slow plan-C
    plateDamage_HiExp: 0.25,
    // a kinetic penetrator punches straight through the thin standoff shield without noticing it
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 1,
    penetration_Frag: 0,
    penetration_Elec: 1,
};

export const hardenedArmor: ArmorModelStats = {
    // blast grinds the slab down slowly instead of being defeated outright (unlike Whipple)
    plateDamage_HiExp: 0.5,
    // the slab genuinely stops kinetic penetrators — normal engagement, no shortcut
    plateDamage_ArmPen: 1,
    plateDamage_Frag: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Elec: 1,
};

export const faradayArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 1,
    penetration_ArmPen: 1,
    // shrapnel cannot penetrate even the basic hull layer — frag affects surface equipment only
    penetration_Frag: 0,
    penetration_Elec: 0,
};

// A Faraday cage layered over any other armor model: blocks Elec hits instead of letting them bypass.
export function withFaradayLayer<T extends ArmorModelStats>(stats: T): T {
    return { ...stats, plateDamage_Elec: 0, penetration_Elec: 0 };
}

export const armorModels = {
    composite: compositeArmor,
    whipple: whippleArmor,
    hardened: hardenedArmor,
    faraday: faradayArmor,
} as const satisfies Record<string, ArmorModelStats>;

export type ArmorModelName = keyof typeof armorModels;
