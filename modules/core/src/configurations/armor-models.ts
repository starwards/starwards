import { ArmorDesign, PenetrationStats, PlateDamageStats } from '../ship/armor';

// per-damage-type stats are mapped from DamageType, so adding a damage type
// fails compilation on every armor model until it takes a stance on it
export type ArmorModelStats = PlateDamageStats &
    PenetrationStats &
    Required<Pick<ArmorDesign, 'singleUsePlates' | 'deflectsSurfaceEffect'>>;

// plateDamage: multiplier on plate erosion only, 0 = armor does not engage the hit.
// The armor is worn down until its plates are dead; system damage behind it is never scaled.
// penetration: fraction of system damage bypassing the plates.
// Surface-effect ammo (HiExp/Frag) always scrapes hull-mounted systems regardless of the armor
// model — the equipment sits outside the plates. deflectsSurfaceEffect negates the scrape for
// deflectable rounds; Frag shrapnel clouds are never deflectable and never penetrate plates.

export const compositeArmor: ArmorModelStats = {
    plateDamage_HiExp: 1,
    // penetrators are composite's weakness — armor-piercing rounds chew it double-speed
    plateDamage_ArmPen: 2,
    // frag never interacts with armor plates (any model) — its damage is the surface scrape only
    plateDamage_Frag: 0,
    plateDamage_Tandem: 1,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const whippleArmor: ArmorModelStats = {
    // the standoff screen defeats most of the blast — massed high-explosive fire remains a very slow plan-C
    plateDamage_HiExp: 0.25,
    // a kinetic penetrator punches straight through the thin standoff shield without noticing it
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    // ...but the screen pre-detonates shaped charges (Tandem) — its historic role
    plateDamage_Tandem: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 1,
    penetration_Frag: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const hardenedArmor: ArmorModelStats = {
    // blast grinds the slab down slowly instead of being defeated outright (unlike Whipple)
    plateDamage_HiExp: 0.5,
    // the slab genuinely stops kinetic penetrators — normal engagement, no shortcut
    plateDamage_ArmPen: 1,
    plateDamage_Frag: 0,
    // ...but a shaped-charge jet (Tandem) burns through thick solid armor double-speed
    plateDamage_Tandem: 2,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const reactiveArmor: ArmorModelStats = {
    // reactive cells react to any warhead (HiExp/ArmPen/Elec): the cell pops and defeats the hit —
    // nothing penetrates, but the cell is spent (exposure is measured before the pop)
    plateDamage_HiExp: 1,
    plateDamage_ArmPen: 1,
    // shrapnel does not activate the reactive cells: no cell consumed, but the scrape lands (not deflectable)
    plateDamage_Frag: 0,
    // tandem precursor pops the cell and the main charge lands at full force
    plateDamage_Tandem: 1,
    plateDamage_Elec: 1,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Tandem: 1,
    penetration_Elec: 0,
    singleUsePlates: true,
    // the reactive charge pushes the round/missile away before its blast develops — no surface scrape
    // (does not apply to Frag: there is no round to deflect, the shrapnel cloud arrives anyway)
    deflectsSurfaceEffect: true,
};

export const faradayArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Tandem: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 1,
    penetration_ArmPen: 1,
    // shrapnel cannot penetrate even the basic hull layer — frag affects surface equipment only
    penetration_Frag: 0,
    penetration_Tandem: 1,
    penetration_Elec: 0,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};
