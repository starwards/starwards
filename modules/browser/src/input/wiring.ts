import { InputManager, numberAction } from '../input/input-manager';
import { readWriteNumberProp, writeProp } from '../property-wrappers';

import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver): InputManager {
    const input = new InputManager();
    input.addRangeAction(
        readWriteNumberProp(shipDriver, '/chainGun/shellRange'),
        shipInputConfig.shellRange,
        'Shell Range',
    );

    input.addMomentaryClickAction(
        writeProp(shipDriver, '/chainGun/isFiring'),
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
        writeProp(shipDriver, '/tubes/0/isFiring'),
        shipInputConfig.tubeIsFiring,
        'Fire Tube',
    );

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
        writeProp(shipDriver, '/maneuveringModeCommand'),
        shipInputConfig.maneuveringMode,
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
