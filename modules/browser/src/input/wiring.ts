import { InputManager } from '../input/input-manager';
import { ShipDriver } from '@starwards/model';
import { shipInputConfig } from '../input/input-config';

export function wireSinglePilotInput(shipDriver: ShipDriver) {
    const input = new InputManager();
    input.addRangeAction(shipDriver.shellRange, shipInputConfig.shellRange);
    input.addRangeAction(shipDriver.rotationCommand, shipInputConfig.rotationCommand);
    input.addRangeAction(shipDriver.strafeCommand, shipInputConfig.strafeCommand);
    input.addRangeAction(shipDriver.boostCommand, shipInputConfig.boostCommand);
    input.addButtonAction(shipDriver.rotationTargetOffset, shipInputConfig.resetRotatioTargetOffset);
    input.addButtonAction(shipDriver.rotationMode, shipInputConfig.rotationMode);
    input.addButtonAction(shipDriver.maneuveringMode, shipInputConfig.maneuveringMode);
    input.addButtonAction(shipDriver.afterBurner, shipInputConfig.afterBurner);
    input.addButtonAction(shipDriver.antiDrift, shipInputConfig.antiDrift);
    input.addButtonAction(shipDriver.breaks, shipInputConfig.breaks);
    input.addButtonAction(shipDriver.chainGunIsFiring, shipInputConfig.chainGunIsFiring);
    input.addButtonAction(shipDriver.target, shipInputConfig.target);
    input.addButtonAction(shipDriver.clearTarget, shipInputConfig.clearTarget);
    input.init();
}
