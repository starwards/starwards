import { ClusterWarheadMode, ShipDriver, clusterWarheadModes, createLogger } from '@starwards/core';
import { readWriteProp, writeProp } from '../property-wrappers';

import { InputManager } from './input-manager';
import { shipInputConfig } from './input-config';

const { warn: logWarn } = createLogger('input:tube-hotkeys');

/**
 * Wires the four per-tube hotkeys (safety, load/unload, change ammo, cluster-warhead mode) for every tube on the
 * ship. Shared by weapons.ts and wiring.ts so the two screens can't drift out of sync.
 */
export function wireTubeHotkeys(input: InputManager, shipDriver: ShipDriver) {
    const { tubeSafety, tubeLoad, tubeChangeAmmo, tubeClusterWarhead } = shipInputConfig;
    const slotCount = Math.min(tubeSafety.length, tubeLoad.length, tubeChangeAmmo.length, tubeClusterWarhead.length);
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
        const clusterWarhead = readWriteProp<ClusterWarheadMode>(shipDriver, `/tubes/${tube.index}/clusterWarhead`);
        input.addClickAction(
            () => clusterWarhead.setValue(nextClusterWarheadMode(clusterWarhead.getValue())),
            tubeClusterWarhead[tube.index],
            `Tube ${tube.index} Cluster Mode`,
        );
    }
}

export function nextClusterWarheadMode(current: ClusterWarheadMode | undefined): ClusterWarheadMode {
    if (current === undefined) {
        return clusterWarheadModes[0];
    }
    return clusterWarheadModes[(clusterWarheadModes.indexOf(current) + 1) % clusterWarheadModes.length];
}
