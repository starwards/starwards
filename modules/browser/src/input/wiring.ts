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
    input.addClickAction(
        numberAction(writeProp(shipDriver, '/smartPilot/rotationTargetOffset')),
        shipInputConfig.resetRotatioTargetOffset
    );
    input.addClickAction(writeProp(shipDriver, '/rotationModeCommand'), shipInputConfig.rotationMode);
    input.addClickAction(writeProp(shipDriver, '/maneuveringModeCommand'), shipInputConfig.maneuveringMode);
    input.addClickAction(numberAction(writeProp(shipDriver, '/afterBurnerCommand')), shipInputConfig.afterBurner);
    input.addClickAction(numberAction(writeProp(shipDriver, '/antiDrift')), shipInputConfig.antiDrift);
    input.addClickAction(numberAction(writeProp(shipDriver, '/breaks')), shipInputConfig.breaks);
    input.addClickAction(writeProp(shipDriver, '/chainGun/isFiring'), shipInputConfig.chainGunIsFiring);
    input.addClickAction(writeProp(shipDriver, '/nextTargetCommand'), shipInputConfig.target);
    input.addClickAction(writeProp(shipDriver, '/clearTargetCommand'), shipInputConfig.clearTarget);
    input.init();
}
