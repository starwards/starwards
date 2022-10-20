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
    input.addButtonAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        shipInputConfig.resetRotatioTargetOffset
    );
    input.addButtonAction(writeProp(shipDriver, '/rotationModeCommand'), shipInputConfig.rotationMode);
    input.addButtonAction(writeProp(shipDriver, '/maneuveringModeCommand'), shipInputConfig.maneuveringMode);
    input.addButtonAction(numberAction(writeProp(shipDriver, '/afterBurnerCommand')), shipInputConfig.afterBurner);
    input.addButtonAction(numberAction(writeProp(shipDriver, '/antiDrift')), shipInputConfig.antiDrift);
    input.addButtonAction(numberAction(writeProp(shipDriver, '/breaks')), shipInputConfig.breaks);
    input.addButtonAction(writeProp(shipDriver, '/chainGun/isFiring'), shipInputConfig.chainGunIsFiring);
    input.addButtonAction(writeProp(shipDriver, '/nextTargetCommand'), shipInputConfig.target);
    input.addButtonAction(writeProp(shipDriver, '/clearTargetCommand'), shipInputConfig.clearTarget);
    input.init();
}
