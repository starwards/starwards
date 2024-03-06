import {
    SmartPilotMode,
    SpaceObject,
    SpaceState,
    XY,
    calcRangediff,
    getKillZoneRadiusRange,
    getShellAimVelocityCompensation,
    isInRange,
    isTargetInKillZone,
    lerp,
    matchGlobalSpeed,
    moveToTarget,
    predictHitLocation,
    rotateToTarget,
    toDegreesDelta,
} from '../';

import { DockingMode } from '../ship/docking';
import { ShipManager } from '../ship/ship-manager-abstract';
import { switchToAvailableAmmo } from '../ship/chain-gun-manager';

// TODO: use ShipApi
export type Bot = {
    type: string;
    update(deltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager): void;
    cleanup(shipManager: ShipManager): void;
};

function cleanup(shipManager: ShipManager) {
    shipManager.state.lastCommand = '';
    shipManager.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
    shipManager.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);
    shipManager.state.smartPilot.rotation = 0;
    shipManager.state.smartPilot.maneuvering.x = 0;
    shipManager.state.smartPilot.maneuvering.y = 0;
    if (shipManager.state.chainGun) {
        shipManager.state.chainGun.isFiring = false;
    }
    shipManager.setTarget(null);
    shipManager.bot = null;
}

export function docker(dockingTarget: SpaceObject): Bot {
    const UndockingOvershootFactor = 1.2;
    let deltaSeconds = 1 / 20;
    const dockingCmd = `Dock at  ${dockingTarget.id}`;
    const undockingCmd = `Undock from  ${dockingTarget.id}`;
    const update = (currDeltaSeconds: number, _spaceState: SpaceState, shipManager: ShipManager) => {
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const ship = shipManager.state;
        if (shipManager.state.docking.mode === DockingMode.DOCKING) {
            shipManager.state.lastCommand = dockingCmd;
            shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
            const diff = XY.difference(dockingTarget.position, ship.position);
            const distance = XY.lengthOf(diff) - dockingTarget.radius - shipManager.state.radius;
            if (!isInRange(0.75, 0.25, distance / ship.docking.maxDockedDistance)) {
                const targetPos = XY.add(
                    ship.position,
                    XY.byLengthAndDirection(distance - ship.docking.maxDockedDistance / 2, XY.angleOf(diff)),
                );
                const maneuvering = moveToTarget(deltaSeconds, ship, targetPos);
                shipManager.state.smartPilot.maneuvering.x = maneuvering.boost;
                shipManager.state.smartPilot.maneuvering.y = maneuvering.strafe;
            } else {
                const maneuvering = matchGlobalSpeed(deltaSeconds, ship, XY.zero);
                ship.smartPilot.maneuvering.x = maneuvering.boost;
                ship.smartPilot.maneuvering.y = maneuvering.strafe;
            }
            const angleRange = ship.docking.design.width / 2;
            const angleDiff = XY.angleOf(diff) - shipManager.state.angle - ship.docking.design.angle;
            if (!isInRange(-angleRange, angleRange, toDegreesDelta(angleDiff))) {
                const offset = -ship.docking.design.angle;
                const rotation = rotateToTarget(deltaSeconds, ship, dockingTarget.position, offset);
                shipManager.state.smartPilot.rotation = rotation;
            }
        } else if (shipManager.state.docking.mode === DockingMode.UNDOCKING) {
            shipManager.state.lastCommand = undockingCmd;
            const diff = XY.difference(dockingTarget.position, ship.position);
            const destination = XY.add(
                ship.position,
                XY.byLengthAndDirection(
                    ship.docking.design.undockingTargetDistance * UndockingOvershootFactor,
                    180 + XY.angleOf(diff),
                ),
            );
            const rotation = rotateToTarget(deltaSeconds, ship, destination, 0);
            const maneuvering = moveToTarget(deltaSeconds, ship, destination);
            shipManager.state.smartPilot.maneuvering.x = maneuvering.boost;
            shipManager.state.smartPilot.maneuvering.y = maneuvering.strafe;
            shipManager.state.smartPilot.rotation = rotation;
        }
    };
    return { type: 'docker', update, cleanup };
}

export function p2pGoto(destination: XY): Bot {
    let deltaSeconds = 1 / 20;
    const cmdName = `Go to ${destination.x},${destination.y} (direct)`;
    const update = (currDeltaSeconds: number, _spaceState: SpaceState, shipManager: ShipManager) => {
        shipManager.state.lastCommand = cmdName;
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const ship = shipManager.state;
        if (XY.equals(ship.position, destination, 1) && XY.isZero(ship.velocity, 1)) {
            cleanup(shipManager);
        } else {
            shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
            const rotation = rotateToTarget(deltaSeconds, ship, destination, 0);
            const maneuvering = moveToTarget(deltaSeconds, ship, destination);
            ship.smartPilot.rotation = rotation;
            ship.smartPilot.maneuvering.x = maneuvering.boost;
            ship.smartPilot.maneuvering.y = maneuvering.strafe;
        }
    };
    return { type: 'p2pGoto', update, cleanup };
}

export function jouster(targetId: string): Bot {
    let lastTargetVelocity = XY.zero;
    let deltaSeconds = 1 / 20;
    const cmdName = `Attack ${targetId} (joust)`;
    const update = (currDeltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => {
        shipManager.state.lastCommand = cmdName;
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const target = spaceState.get(targetId) || null;
        const ship = shipManager.state;
        if (target && !target.destroyed && ship.chainGun) {
            shipManager.setTarget(targetId);
            switchToAvailableAmmo(ship.chainGun, ship.magazine);
            const targetAccel = XY.scale(XY.difference(target.velocity, lastTargetVelocity), 1 / deltaSeconds);
            const hitLocation = predictHitLocation(ship, ship.chainGun, target, targetAccel);
            const rangeDiff = calcRangediff(ship, target, hitLocation);
            const range = ship.chainGun.design.maxShellRange - ship.chainGun.design.minShellRange;
            ship.chainGun.shellRange = lerp([-range / 2, range / 2], [-1, 1], rangeDiff);
            const rotation = rotateToTarget(
                deltaSeconds,
                ship,
                XY.add(hitLocation, getShellAimVelocityCompensation(ship, ship.chainGun)),
                0,
            );
            ship.smartPilot.rotation = rotation;
            const shipToTarget = XY.difference(hitLocation, ship.position);
            const distanceToTarget = XY.lengthOf(shipToTarget);
            const killRadius = getKillZoneRadiusRange(ship.chainGun);
            if (isInRange(killRadius[0], killRadius[1], distanceToTarget)) {
                // if close enough to target, tail it
                const maneuvering = matchGlobalSpeed(deltaSeconds, ship, target.velocity);

                ship.smartPilot.maneuvering.x = maneuvering.boost;
                ship.smartPilot.maneuvering.y = maneuvering.strafe;
            } else {
                const maneuvering = moveToTarget(deltaSeconds, ship, hitLocation);
                // close distance to target
                if (distanceToTarget > killRadius[1]) {
                    ship.smartPilot.maneuvering.x = maneuvering.boost;
                    ship.smartPilot.maneuvering.y = maneuvering.strafe;
                } else {
                    // distanceToTarget < killRadius[0]
                    ship.smartPilot.maneuvering.x = -maneuvering.boost;
                    ship.smartPilot.maneuvering.y = -maneuvering.strafe;
                }
            }
            lastTargetVelocity = XY.clone(target.velocity);
            ship.chainGun.isFiring = isTargetInKillZone(ship, ship.chainGun, target);
        } else {
            cleanup(shipManager);
        }
    };
    return { type: 'jouster', update, cleanup };
}
