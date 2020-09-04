import {
    capToRange,
    getKillZoneRadius,
    getShellSecondsToLive,
    getTarget,
    isInRange,
    isTargetInKillZone,
    matchTargetDirection,
    matchTargetSpeed,
    moveToTarget,
    SpaceObject,
    SpaceState,
    XY,
} from '@starwards/model';
import { ShipManager } from '../ship/ship-manager';

export type Bot = (spaceState: SpaceState, shipManager: ShipManager, deltaSeconds: number) => void;

function tailTarget(shipManager: ShipManager, target: SpaceObject, deltaSeconds: number) {
    const ship = shipManager.state;
    shipManager.setShellSecondsToLive(getShellSecondsToLive(shipManager.state, target.position));
    const heading = matchTargetDirection(deltaSeconds, shipManager.state, target);
    shipManager.setTargetTurnSpeed(capToRange(-90, 90, heading));
    const shipToTarget = XY.difference(target.position, ship.position);
    const distanceToTarget = XY.lengthOf(shipToTarget);
    const killRadius = getKillZoneRadius(ship);
    if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
        // if close enough to target, tail it
        const maneuvering = matchTargetSpeed(deltaSeconds, shipManager.state, target);
        shipManager.setBoost(capToRange(-5, 5, maneuvering.boost));
        shipManager.setStrafe(capToRange(-5, 5, maneuvering.strafe));
    } else {
        const maneuvering = moveToTarget(deltaSeconds, shipManager.state, target.position, 100);
        // close distance to target
        if (distanceToTarget > killRadius[1]) {
            shipManager.setBoost(capToRange(-5, 5, maneuvering.boost));
            shipManager.setStrafe(capToRange(-5, 5, maneuvering.strafe));
        } else {
            // distanceToTarget < killRadius[0]
            shipManager.setBoost(capToRange(-5, 5, -maneuvering.boost));
            shipManager.setStrafe(capToRange(-5, 5, -maneuvering.strafe));
        }
    }
}

export function terminator(spaceState: SpaceState, shipManager: ShipManager, deltaSeconds: number) {
    const target = getTarget(shipManager.state, spaceState);
    if (target) {
        tailTarget(shipManager, target, deltaSeconds);
        shipManager.chainGun(isTargetInKillZone(shipManager.state, target));
    } else {
        shipManager.chainGun(false);
    }
}
