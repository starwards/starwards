import { InputManager, numberAction } from '../input/input-manager';
import {
    readWriteAllNumberProp,
    readWriteNumberProp,
    readWriteProp,
    writeAllProp,
    writeProp,
} from '../property-wrappers';

import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver): InputManager {
    const input = new InputManager();
    input.addRangeAction(
        readWriteAllNumberProp(
            shipDriver,
            shipDriver.state.chainGuns.map((_, index) => `/chainGuns/${index}/shellRange`),
        ),
        shipInputConfig.shellRange,
        'Shell Range',
    );

    input.addMomentaryClickAction(
        writeAllProp(
            shipDriver,
            shipDriver.state.chainGuns.map((_, index) => `/chainGuns/${index}/isFiring`),
        ),
        shipInputConfig.chainGunIsFiring,
        'Fire Chain Gun',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/weaponsTarget/nextTargetCommand'),
        shipInputConfig.target,
        'Next Target',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/weaponsTarget/clearTargetCommand'),
        shipInputConfig.clearTarget,
        'Clear Target',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/fireTubesCommand'),
        shipInputConfig.tubeIsFiring,
        'Fire Tubes',
    );

    // Per-tube controls: safety (digit), load (shift+digit), change ammo (alt+digit)
    for (const tube of shipDriver.state.tubes) {
        const index = tube.index;
        if (index < shipInputConfig.tubeSafety.length) {
            input.addToggleClickAction(
                readWriteProp(shipDriver, `/tubes/${index}/safetyLocked`),
                shipInputConfig.tubeSafety[index],
                `Tube ${index} Safety`,
            );
        }
        if (index < shipInputConfig.tubeLoadAmmo.length) {
            input.addToggleClickAction(
                readWriteProp(shipDriver, `/tubes/${index}/loadAmmo`),
                shipInputConfig.tubeLoadAmmo[index],
                `Tube ${index} Load`,
            );
        }
        if (index < shipInputConfig.tubeChangeAmmo.length) {
            input.addMomentaryClickAction(
                writeProp(shipDriver, `/tubes/${index}/changeProjectileCommand`),
                shipInputConfig.tubeChangeAmmo[index],
                `Tube ${index} Change Ammo`,
            );
        }
    }

    // pilot
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/rotation'),
        shipInputConfig.rotationCommand,
        'Rotation',
    );
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/y'),
        shipInputConfig.strafeCommand,
        'Strafe',
    );
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/x'),
        shipInputConfig.boostCommand,
        'Boost',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        shipInputConfig.resetRotatioTargetOffset,
        'Reset Rotation Offset',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/rotationModeCommand'),
        shipInputConfig.rotationMode,
        'Rotation Mode',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/rotationModeCommand'),
        shipInputConfig.rotationModeKey,
        'Rotation Mode',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/maneuveringModeCommand'),
        shipInputConfig.maneuveringMode,
        'Maneuvering Mode',
    );
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/maneuveringModeCommand'),
        shipInputConfig.maneuveringModeKey,
        'Maneuvering Mode',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/afterBurnerCommand')),
        shipInputConfig.afterBurner,
        'After Burner',
    );
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/antiDrift')),
        shipInputConfig.antiDrift,
        'Anti Drift',
    );
    input.addMomentaryClickAction(numberAction(writeProp(shipDriver, '/breaks')), shipInputConfig.breaks, 'Breaks');
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelUpCommand'), shipInputConfig.warpUp, 'Warp Up');
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/warp/levelDownCommand'),
        shipInputConfig.warpDown,
        'Warp Down',
    );
    input.addMomentaryClickAction(writeProp(shipDriver, '/docking/toggleCommand'), shipInputConfig.dock, 'Toggle Dock');
    input.init();
    return input;
}
