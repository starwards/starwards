import { AmmoType, missileAmmoTypes } from '@starwards/core';

/** Ammo family name without its kind: `HiExpMissile` is `Hi-Exp`. */
export function ammoFamilyName(ammo: AmmoType): string {
    const family = ammo.replace(/(Shell|Missile)$/, '');
    return family.replace(/([a-z])([A-Z])/g, '$1-$2');
}

/** Ammo name as an instrument shows it: `HiExpMissile` is `HI-EXP MSL`, `None` is `—`. */
export function ammoReadoutName(ammo: AmmoType | 'None'): string {
    if (ammo === 'None') {
        return '—';
    }
    const kind = (missileAmmoTypes as readonly string[]).includes(ammo) ? 'MSL' : 'SHELL';
    return `${ammoFamilyName(ammo)} ${kind}`.toUpperCase();
}
