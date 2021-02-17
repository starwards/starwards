import { InputManager } from './input-manager';
import { getShipRoom } from './client';
import { inputConfig } from './ship-input';
import { shipProperties } from './ship-properties';

export async function gamepadInput(input: InputManager, shipId: string) {
    const shipRoom = await getShipRoom(shipId);
    const properties = shipProperties(shipRoom);
    input.addAxisAction(properties.shellRange, inputConfig.shellRange, inputConfig.shellRangeButtons);
    input.addAxisAction(properties.smartPilotRotation, inputConfig.smartPilotRotation, undefined);
    input.addAxisAction(properties.smartPilotStrafe, inputConfig.smartPilotStrafe, undefined);
    input.addAxisAction(properties.smartPilotBoost, inputConfig.smartPilotBoost, undefined);
    input.addButtonAction(properties.rotationMode, inputConfig.rotationMode);
    input.addButtonAction(properties.maneuveringMode, inputConfig.maneuveringMode);
    input.addButtonAction(properties.useReserveSpeed, inputConfig.useReserveSpeed);
    input.addButtonAction(properties.antiDrift, inputConfig.antiDrift);
    input.addButtonAction(properties.breaks, inputConfig.breaks);
    input.addButtonAction(properties.chainGunIsFiring, inputConfig.chainGunIsFiring);
    input.addButtonAction(properties.target, inputConfig.target);
}
