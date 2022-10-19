import { InputManager, numberAction } from '../input/input-manager';

import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver) {
    const input = new InputManager();
    input.addRangeAction(shipDriver.readWriteNumberProp('/chainGun/shellRange'), shipInputConfig.shellRange);
    input.addRangeAction(
        shipDriver.readWriteNumberProp('/smartPilot/smartPilot/rotation'),
        shipInputConfig.rotationCommand
    );
    input.addRangeAction(shipDriver.readWriteNumberProp('/smartPilot/maneuvering/y'), shipInputConfig.strafeCommand);
    input.addRangeAction(shipDriver.readWriteNumberProp('/smartPilot/maneuvering/x'), shipInputConfig.boostCommand);
    input.addButtonAction(
        numberAction(shipDriver.writeProp('/smartPilot/rotationTargetOffset')),
        shipInputConfig.resetRotatioTargetOffset
    );
    input.addButtonAction(shipDriver.writeProp('/rotationModeCommand'), shipInputConfig.rotationMode);
    input.addButtonAction(shipDriver.writeProp('/maneuveringModeCommand'), shipInputConfig.maneuveringMode);
    input.addButtonAction(numberAction(shipDriver.writeProp('/afterBurnerCommand')), shipInputConfig.afterBurner);
    input.addButtonAction(numberAction(shipDriver.writeProp('/antiDrift')), shipInputConfig.antiDrift);
    input.addButtonAction(numberAction(shipDriver.writeProp('/breaks')), shipInputConfig.breaks);
    input.addButtonAction(shipDriver.writeProp('/chainGun/isFiring'), shipInputConfig.chainGunIsFiring);
    input.addButtonAction(shipDriver.writeProp('/nextTargetCommand'), shipInputConfig.target);
    input.addButtonAction(shipDriver.writeProp('/clearTargetCommand'), shipInputConfig.clearTarget);
    input.init();
}
