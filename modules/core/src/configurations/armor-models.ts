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
>;

// plateDamage: multiplier on plate + system damage, 0 = armor does not engage the hit.
// penetration: fraction of system damage bypassing the plates.

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
};

export const hardenedArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
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
};

export const reactiveArmor: ArmorModelStats = {
    plateDamage_HiExp: 0,
    plateDamage_ArmPen: 0,
    plateDamage_Frag: 0,
    plateDamage_Cluster: 0,
    // tandem precursor pops the cell and the main charge lands at full force
    plateDamage_Tandem: 4,
    plateDamage_Elec: 0,
    penetration_HiExp: 0,
    penetration_ArmPen: 0,
    penetration_Frag: 0,
    penetration_Cluster: 0,
    penetration_Tandem: 1,
    penetration_Elec: 1,
    singleUsePlates: true,
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
};

// A Faraday cage layered over any other armor model: blocks Elec hits instead of letting them bypass.
export function withFaradayLayer<T extends ArmorModelStats>(stats: T): T {
    return { ...stats, plateDamage_Elec: 0, penetration_Elec: 0 };
}
