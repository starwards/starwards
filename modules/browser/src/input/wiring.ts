import { InputManager } from '../input/input-manager';
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
    input.addButtonAction(
        { setValue: (v: boolean) => shipDriver.afterBurner.setValue(Number(v)) },
        shipInputConfig.afterBurner
    );
    input.addButtonAction(
        { setValue: (v: boolean) => shipDriver.antiDrift.setValue(Number(v)) },
        shipInputConfig.antiDrift
    );
    input.addButtonAction({ setValue: (v: boolean) => shipDriver.breaks.setValue(Number(v)) }, shipInputConfig.breaks);
    input.addButtonAction(shipDriver.writeProp('/chainGun/isFiring'), shipInputConfig.chainGunIsFiring);
    input.addButtonAction(shipDriver.writeProp('/nextTargetCommand'), shipInputConfig.target);
    input.addButtonAction(shipDriver.writeProp('/clearTargetCommand'), shipInputConfig.clearTarget);
    input.init();
}
