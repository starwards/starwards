import { ArmorDesign } from '../ship/armor';

export type ArmorModelStats = Pick<
    ArmorDesign,
    | 'plateDamage_HiExp'
    | 'plateDamage_ArmPen'
    | 'plateDamage_Frag'
    | 'plateDamage_Cluster'
    | 'plateDamage_Tandem'
    | 'plateDamage_Elec'
    | 'penetration_HiExp'
    | 'penetration_ArmPen'
    | 'penetration_Frag'
    | 'penetration_Cluster'
    | 'penetration_Tandem'
    | 'penetration_Elec'
    | 'singleUsePlates'
    | 'deflectsSurfaceEffect'
>;

// plateDamage: multiplier on plate erosion only, 0 = armor does not engage the hit.
// The armor is worn down until its plates are dead; system damage behind it is never scaled.
// penetration: fraction of system damage bypassing the plates.
// Surface-effect ammo (HiExp/Frag/Cluster) always scrapes hull-mounted systems regardless of
// the armor model — the equipment sits outside the plates — unless deflectsSurfaceEffect is set.

export const compositeArmor: ArmorModelStats = {
    plateDamage_HiExp: 1,
    plateDamage_ArmPen: 1,
    plateDamage_Frag: 1,
    plateDamage_Cluster: 1,
    plateDamage_Tandem: 2,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Cluster: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const whippleArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 2,
    plateDamage_Frag: 0,
    plateDamage_Cluster: 0,
    plateDamage_Tandem: 2,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Cluster: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const hardenedArmor: ArmorModelStats = {
    // blast grinds the slab down slowly instead of being defeated outright (unlike Whipple)
    plateDamage_HiExp: 0.5,
    plateDamage_ArmPen: 2,
    plateDamage_Frag: 0,
    plateDamage_Cluster: 0,
    plateDamage_Tandem: 1,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Cluster: 0,
    penetration_Tandem: 0,
    penetration_Elec: 1,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

export const reactiveArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Cluster: 0,
    // tandem precursor pops the cell (any engaging value consumes it) and the main charge lands at full force
    plateDamage_Tandem: 1,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Cluster: 0,
    penetration_Tandem: 1,
    penetration_Elec: 1,
    singleUsePlates: true,
    // ERA pushes the round/missile away before its blast develops — no surface scrape
    deflectsSurfaceEffect: true,
};

export const faradayArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Cluster: 0,
    plateDamage_Tandem: 0,
    plateDamage_Elec: 0,
    penetration_HiExp: 1,
    penetration_ArmPen: 1,
    penetration_Frag: 1,
    penetration_Cluster: 1,
    penetration_Tandem: 1,
    penetration_Elec: 0,
    singleUsePlates: false,
    deflectsSurfaceEffect: false,
};

// A Faraday cage layered over any other armor model: blocks Elec hits instead of letting them bypass.
export function withFaradayLayer<T extends ArmorModelStats>(stats: T): T {
    return { ...stats, plateDamage_Elec: 0, penetration_Elec: 0 };
}
