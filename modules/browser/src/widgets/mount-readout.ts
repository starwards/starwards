import { AmmoType, Destructors, ShipDriver } from '@starwards/core';
import { aggregate, readProp } from '../property-wrappers';

import { FolderApi } from 'tweakpane';
import { addTextBlade } from '../panel';
import { ammoReadoutName } from './ammo-names';

type Selected = AmmoType | 'None';

/**
 * The ammo rows of a gun mount (a tube or a chain gun) at `pointer`: what it holds, or what it is
 * loading while empty. A second `Next` row appears only while the selected ammo differs from what
 * the first row shows, so a pending change of ammo is never hidden.
 */
export function addMountAmmoRows(
    folder: FolderApi,
    shipDriver: ShipDriver,
    pointer: `/${string}`,
    cleanup: Destructors,
) {
    const loadedProp = readProp<Selected>(shipDriver, `${pointer}/loadedProjectile`);
    const selectedProp = readProp<Selected>(shipDriver, `${pointer}/projectile`);
    const loaded = () => loadedProp.getValue() ?? 'None';
    const selected = () => selectedProp.getValue() ?? 'None';
    const isLoaded = () => loaded() !== 'None';
    const underlying = [loadedProp, selectedProp];

    const current = addTextBlade(
        folder,
        aggregate(underlying, () => ammoReadoutName(isLoaded() ? loaded() : selected())),
        { label: 'Loaded' },
        cleanup.add,
    );
    current.element.classList.add('sw-mode');
    const currentLabel = current.element.querySelector('.tp-lblv_l');
    const applyLabel = () => {
        if (currentLabel) {
            currentLabel.textContent = isLoaded() ? 'Loaded' : 'Loading';
        }
    };
    cleanup.add(loadedProp.onChange(applyLabel));
    applyLabel();

    const next = addTextBlade(
        folder,
        aggregate(underlying, () => ammoReadoutName(selected())),
        { label: 'Next' },
        cleanup.add,
    );
    next.element.classList.add('sw-mode');
    const applyNextVisibility = () => {
        next.element.style.display = isLoaded() && selected() !== loaded() ? '' : 'none';
    };
    for (const prop of underlying) {
        cleanup.add(prop.onChange(applyNextVisibility));
    }
    applyNextVisibility();
}
