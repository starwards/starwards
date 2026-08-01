import { AmmoType, missileAmmoTypes, shellAmmoTypes } from '@starwards/core';

/** A labelled section of the Ammunition widget. */
type AmmoGroup = { title: string; ammo: AmmoType[] };

/** The magazine capacities the grouping reads — `MagazineDesignState`'s `max_*` fields. */
type AmmoCapacities = Record<`max_${AmmoType}`, number>;

/**
 * Splits the magazine's ammo into shell and missile sections, dropping ammo the magazine has no
 * room for. Nine flat rows read poorly at the weapons station.
 */
export function ammoGroups(capacities: AmmoCapacities): AmmoGroup[] {
    const carried = (ammo: AmmoType) => capacities[`max_${ammo}`] > 0;
    return [
        { title: 'Shells', ammo: shellAmmoTypes.filter(carried) as AmmoType[] },
        { title: 'Missiles', ammo: missileAmmoTypes.filter(carried) as AmmoType[] },
    ].filter((group) => group.ammo.length > 0);
}
