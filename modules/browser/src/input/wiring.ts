import { InputManager, numberAction } from '../input/input-manager';

import { ShipDriver } from '@starwards/core';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver) {
    const input = new InputManager();
    input.addRangeAction(shipDriver.shellRange, shipInputConfig.shellRange);
    input.addRangeAction(shipDriver.rotationCommand, shipInputConfig.rotationCommand);
    input.addRangeAction(shipDriver.strafeCommand, shipInputConfig.strafeCommand);
    input.addRangeAction(shipDriver.boostCommand, shipInputConfig.boostCommand);
    input.addButtonAction(
        { setValue: (v: boolean) => shipDriver.rotationTargetOffset.setValue(Number(v)) },
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
