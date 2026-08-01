import { AmmoType, missileAmmoTypes, shellAmmoTypes } from '@starwards/core';

/** A labelled section of the Ammunition widget. */
type AmmoGroup = { title: string; ammo: readonly AmmoType[] };

/**
 * The magazine's ammo split into shell and missile sections. Nine flat rows read poorly at the
 * weapons station.
 */
export const ammoGroups: readonly AmmoGroup[] = [
    { title: 'Shells', ammo: shellAmmoTypes },
    { title: 'Missiles', ammo: missileAmmoTypes },
];
