import { GameRoom, shipProperties } from '@starwards/model';
import {
    NumberMapDriver,
    wrapIteratorStateProperty,
    wrapNormalNumericProperty,
    wrapNumericProperty,
    wrapStringStateProperty,
} from './utils';

export function ShipDriver(shipRoom: GameRoom<'ship'>) {
    return {
        state: shipRoom.state,
        constants: new NumberMapDriver(shipRoom, shipProperties.constants),
        chainGunConstants: new NumberMapDriver(shipRoom, shipProperties.chainGunConstants),
        smartPilotRotation: wrapNumericProperty(shipRoom, shipProperties.smartPilotRotation),
        shellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive),
        shellRange: wrapNumericProperty(shipRoom, shipProperties.shellRange),
        rotation: wrapNumericProperty(shipRoom, shipProperties.rotation),
        smartPilotStrafe: wrapNumericProperty(shipRoom, shipProperties.smartPilotStrafe),
        smartPilotBoost: wrapNumericProperty(shipRoom, shipProperties.smartPilotBoost),
        strafe: wrapNumericProperty(shipRoom, shipProperties.strafe),
        boost: wrapNumericProperty(shipRoom, shipProperties.boost),
        energy: wrapNumericProperty(shipRoom, shipProperties.energy),
        reserveSpeed: wrapNumericProperty(shipRoom, shipProperties.reserveSpeed),
        turnSpeed: wrapNumericProperty(shipRoom, shipProperties.turnSpeed),
        angle: wrapNumericProperty(shipRoom, shipProperties.angle),
        'speed direction': wrapNumericProperty(shipRoom, shipProperties.velocityAngle),
        speed: wrapNumericProperty(shipRoom, shipProperties.speed),
        chainGunCooldown: wrapNumericProperty(shipRoom, shipProperties.chainGunCoolDown),
        chainGunShellSecondsToLive: wrapNumericProperty(shipRoom, shipProperties.shellSecondsToLive),
        useReserveSpeed: wrapNormalNumericProperty(shipRoom, shipProperties.useReserveSpeed),
        antiDrift: wrapNormalNumericProperty(shipRoom, shipProperties.antiDrift),
        breaks: wrapNormalNumericProperty(shipRoom, shipProperties.breaks),
        targeted: wrapStringStateProperty(shipRoom, shipProperties.targeted),
        chainGunIsFiring: wrapIteratorStateProperty(shipRoom, shipProperties.chainGunIsFiring),
        target: wrapIteratorStateProperty(shipRoom, shipProperties.target),
        rotationMode: wrapIteratorStateProperty(shipRoom, shipProperties.rotationMode),
        maneuveringMode: wrapIteratorStateProperty(shipRoom, shipProperties.maneuveringMode),
    };
}
