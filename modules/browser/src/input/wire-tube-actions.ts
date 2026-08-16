import { ShipDriver, createLogger } from '@starwards/core';
import { readWriteProp, writeProp } from '../property-wrappers';

import { InputManager } from './input-manager';
import { shipInputConfig } from './input-config';

const { warn: logWarn } = createLogger('input:tube-actions');

/**
 * Wires the three per-tube hotkeys — safety, load/unload, change ammo — shared by every screen
 * that exposes tube controls (weapons station, single-player combined screen). Keeping this in
 * one place is what keeps those screens' bindings from drifting apart.
 */
export function wireTubeActions(input: InputManager, shipDriver: ShipDriver): void {
    for (const tube of shipDriver.state.tubes) {
        const safetyKey = shipInputConfig.tubeSafety[tube.index];
        const loadUnloadKey = shipInputConfig.tubeLoadUnload[tube.index];
        const changeAmmoKey = shipInputConfig.tubeChangeAmmo[tube.index];
        if (!safetyKey || !loadUnloadKey || !changeAmmoKey) {
            logWarn(`no dedicated hotkey available for tube ${tube.index}, skipping its hotkey bindings`);
            continue;
        }
        input.addToggleClickAction(
            readWriteProp(shipDriver, `/tubes/${tube.index}/safetyLocked`),
            safetyKey,
            `Tube ${tube.index} Safety`,
        );
        input.addToggleClickAction(
            readWriteProp(shipDriver, `/tubes/${tube.index}/loadAmmo`),
            loadUnloadKey,
            `Tube ${tube.index} Load`,
        );
        input.addMomentaryClickAction(
            writeProp(shipDriver, `/tubes/${tube.index}/changeProjectileCommand`),
            changeAmmoKey,
            `Tube ${tube.index} Change Ammo`,
        );
    }
}
