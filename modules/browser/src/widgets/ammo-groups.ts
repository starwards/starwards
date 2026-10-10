import { MagazineStock, ShellAmmoType, ammoDesigns, magazineStocks, shellAmmoTypes } from '@starwards/core';

/** A labelled section of the Magazine widget. */
type AmmoGroup = { title: string; ammo: MagazineStock[] };

/** The magazine capacities the grouping reads — `MagazineDesignState`'s `max_*` fields. */
type AmmoCapacities = Record<`max_${MagazineStock}`, number>;

/** The gun bore a design name leads with (`30mm HiExp shell`), or nothing for ammo that has none. */
function caliber(ammo: ShellAmmoType): string {
    return /^\d+mm/i.exec(ammoDesigns[ammo].name)?.[0] ?? '';
}

/**
 * Splits the magazine's ammo into shell and missile sections, dropping ammo the magazine has no
 * room for. Nine flat rows read poorly at the weapons station.
 */
export function ammoGroups(capacities: AmmoCapacities): AmmoGroup[] {
    const carried = (ammo: MagazineStock) => capacities[`max_${ammo}`] > 0;
    const shells = shellAmmoTypes.filter(carried);
    const missiles = magazineStocks.filter(
        (ammo) => !(shellAmmoTypes as readonly string[]).includes(ammo) && carried(ammo),
    );
    return [
        { title: `Shells ${shells.length > 0 ? caliber(shells[0]) : ''}`.trim(), ammo: shells },
        { title: 'Missiles', ammo: missiles },
    ].filter((group) => group.ammo.length > 0);
}
