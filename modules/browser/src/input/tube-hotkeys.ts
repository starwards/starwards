import { ShipDriver, createLogger } from '@starwards/core';
import { readWriteProp, writeProp } from '../property-wrappers';

import { InputManager } from './input-manager';
import { shipInputConfig } from './input-config';

const { warn: logWarn } = createLogger('input:tube-hotkeys');

/**
 * Wires the three per-tube hotkeys (safety, load/unload, change ammo) for every tube on the
 * ship. Shared by weapons.ts and wiring.ts so the two screens can't drift out of sync.
 */
export function wireTubeHotkeys(input: InputManager, shipDriver: ShipDriver) {
    const { tubeSafety, tubeLoad, tubeChangeAmmo } = shipInputConfig;
    const slotCount = Math.min(tubeSafety.length, tubeLoad.length, tubeChangeAmmo.length);
    const tubes = shipDriver.state.tubes;
    if (tubes.length > slotCount) {
        logWarn(`ship has ${tubes.length} tubes but only ${slotCount} tube hotkey slots are configured`);
    }
    for (const tube of tubes) {
        if (tube.index >= slotCount) {
            continue;
        }
        input.addToggleClickAction(
            readWriteProp(shipDriver, `/tubes/${tube.index}/safetyLocked`),
            tubeSafety[tube.index],
            `Tube ${tube.index} Safety`,
        );
        input.addToggleClickAction(
            readWriteProp(shipDriver, `/tubes/${tube.index}/loadAmmo`),
            tubeLoad[tube.index],
            `Tube ${tube.index} Load`,
        );
        input.addMomentaryClickAction(
            writeProp(shipDriver, `/tubes/${tube.index}/changeProjectileCommand`),
            tubeChangeAmmo[tube.index],
            `Tube ${tube.index} Change Ammo`,
        );
    }
}
