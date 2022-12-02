import { InputManager, numberAction } from '../input/input-manager';
import { readWriteNumberProp, writeProp } from '../property-wrappers';

import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver) {
    const input = new InputManager();
    input.addRangeAction(readWriteNumberProp(shipDriver, '/chainGun/shellRange'), shipInputConfig.shellRange);
    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/rotation'), shipInputConfig.rotationCommand);
    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/y'), shipInputConfig.strafeCommand);
    input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/x'), shipInputConfig.boostCommand);
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        shipInputConfig.resetRotatioTargetOffset
    );
    input.addMomentaryClickAction(writeProp(shipDriver, '/rotationModeCommand'), shipInputConfig.rotationMode);
    input.addMomentaryClickAction(writeProp(shipDriver, '/maneuveringModeCommand'), shipInputConfig.maneuveringMode);
    input.addMomentaryClickAction(
        numberAction(writeProp(shipDriver, '/afterBurnerCommand')),
        shipInputConfig.afterBurner
    );
    input.addMomentaryClickAction(numberAction(writeProp(shipDriver, '/antiDrift')), shipInputConfig.antiDrift);
    input.addMomentaryClickAction(numberAction(writeProp(shipDriver, '/breaks')), shipInputConfig.breaks);
    input.addMomentaryClickAction(writeProp(shipDriver, '/chainGun/isFiring'), shipInputConfig.chainGunIsFiring);
    input.addMomentaryClickAction(writeProp(shipDriver, '/weaponsTarget/nextTargetCommand'), shipInputConfig.target);
    input.addMomentaryClickAction(
        writeProp(shipDriver, '/weaponsTarget/clearTargetCommand'),
        shipInputConfig.clearTarget
    );
    input.addMomentaryClickAction(writeProp(shipDriver, '/tubes/0/isFiring'), shipInputConfig.tubeIsFiring);
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelUpCommand'), shipInputConfig.warpUp);
    input.addMomentaryClickAction(writeProp(shipDriver, '/warp/levelDownCommand'), shipInputConfig.warpDown);
    input.addMomentaryClickAction(writeProp(shipDriver, '/docking/toggleCommand'), shipInputConfig.dock);
    input.init();
}
