import { AmmoType, ammoDesigns, missileAmmoTypes, shellAmmoTypes } from '@starwards/core';

/** A labelled section of the Magazine widget. */
type AmmoGroup = { title: string; ammo: AmmoType[] };

/** The magazine capacities the grouping reads — `MagazineDesignState`'s `max_*` fields. */
type AmmoCapacities = Record<`max_${AmmoType}`, number>;

/** The gun bore a design name leads with (`30mm HiExp shell`), or nothing for ammo that has none. */
function caliber(ammo: AmmoType): string {
    return /^\d+mm/i.exec(ammoDesigns[ammo].name)?.[0] ?? '';
}

/**
 * Splits the magazine's ammo into shell and missile sections, dropping ammo the magazine has no
 * room for. Nine flat rows read poorly at the weapons station.
 */
export function ammoGroups(capacities: AmmoCapacities): AmmoGroup[] {
    const carried = (ammo: AmmoType) => capacities[`max_${ammo}`] > 0;
    const shells = shellAmmoTypes.filter(carried) as AmmoType[];
    const missiles = missileAmmoTypes.filter(carried) as AmmoType[];
    return [
        { title: `Shells ${shells.length > 0 ? caliber(shells[0]) : ''}`.trim(), ammo: shells },
        { title: 'Missiles', ammo: missiles },
    ].filter((group) => group.ammo.length > 0);
}
