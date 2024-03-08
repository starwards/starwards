import {
    ManeuveringCommand,
    RTuple2,
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
} from '..';

import { DockingMode } from '../ship/docking';
import { ShipManager } from '../ship/ship-manager-abstract';
import { switchToAvailableAmmo } from '../ship/chain-gun-manager';

// TODO: use ShipApi
export type AutonomousTask = {
    type: string;
    update(deltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager): void;
    cleanup(shipManager: ShipManager): void;
};

function cleanup(shipManager: ShipManager) {
    shipManager.state.currentTask = '';
    shipManager.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
    shipManager.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);
    shipManager.state.smartPilot.rotation = 0;
    shipManager.state.smartPilot.maneuvering.x = 0;
    shipManager.state.smartPilot.maneuvering.y = 0;
    if (shipManager.state.chainGun) {
        shipManager.state.chainGun.isFiring = false;
    }
    shipManager.setTarget(null);
    shipManager.autonomoustask = null;
}

export function docker(dockingTarget: SpaceObject): AutonomousTask {
    const UndockingOvershootFactor = 1.2;
    let deltaSeconds = 1 / 20;
    const dockingCmd = `Dock at  ${dockingTarget.id}`;
    const undockingCmd = `Undock from  ${dockingTarget.id}`;
    const update = (currDeltaSeconds: number, _spaceState: SpaceState, shipManager: ShipManager) => {
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const ship = shipManager.state;
        if (shipManager.state.docking.mode === DockingMode.DOCKING) {
            shipManager.state.currentTask = dockingCmd;
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
            shipManager.state.currentTask = undockingCmd;
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

export function goto(destination: XY): AutonomousTask {
    let deltaSeconds = 1 / 20;
    const cmdName = `Go to ${destination.x},${destination.y}`;
    const update = (currDeltaSeconds: number, _spaceState: SpaceState, shipManager: ShipManager) => {
        shipManager.state.currentTask = cmdName;
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const ship = shipManager.state;
        const trackRange: RTuple2 = [0, ship.radius];
        if (XY.equals(ship.position, destination, trackRange[1]) && XY.isZero(ship.velocity)) {
            cleanup(shipManager);
            return;
        }
        positionNearTarget(shipManager, XY.zero, destination, XY.zero, trackRange, deltaSeconds);
    };
    return { type: 'p2pGoto', update, cleanup };
}

function positionNearTarget(
    shipManager: ShipManager,
    targetVelocity: XY,
    targetPosition: XY,
    rotationCompensation: XY,
    trackRange: RTuple2,
    deltaSeconds: number,
) {
    const ship = shipManager.state;
    const shipToTarget = XY.difference(targetPosition, ship.position);
    const distanceToTarget = XY.lengthOf(shipToTarget);
    let maneuvering: ManeuveringCommand;
    if (isInRange(trackRange[0], trackRange[1], distanceToTarget)) {
        maneuvering = matchGlobalSpeed(deltaSeconds, ship, targetVelocity);
    } else {
        maneuvering = moveToTarget(deltaSeconds, ship, targetPosition);
        if (distanceToTarget < trackRange[0]) {
            maneuvering.boost = -maneuvering.boost;
            maneuvering.strafe = -maneuvering.strafe;
        }
    }
    const rotation = rotateToTarget(deltaSeconds, ship, XY.add(targetPosition, rotationCompensation), 0);
    shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    ship.smartPilot.maneuvering.x = maneuvering.boost;
    ship.smartPilot.maneuvering.y = maneuvering.strafe;
    ship.smartPilot.rotation = rotation;
}

export function follow(targetId: string, fire: boolean): AutonomousTask {
    let lastTargetVelocity = XY.zero;
    let deltaSeconds = 1 / 20;
    const cmdName = fire ? `Attack ${targetId}` : `Follow ${targetId}`;
    const update = (currDeltaSeconds: number, spaceState: SpaceState, shipManager: ShipManager) => {
        shipManager.state.currentTask = cmdName;
        deltaSeconds = deltaSeconds * 0.8 + currDeltaSeconds * 0.2;
        const target = spaceState.get(targetId) || null;
        const ship = shipManager.state;
        const controlWeapon = ship.chainGun;
        if (!target || target.destroyed || (fire && !controlWeapon)) {
            cleanup(shipManager);
            return;
        }
        let trackRange: RTuple2, rotationCompensation: XY;
        if (fire && controlWeapon) {
            shipManager.setTarget(targetId);
            const targetAccel = XY.scale(XY.difference(target.velocity, lastTargetVelocity), 1 / deltaSeconds);
            switchToAvailableAmmo(controlWeapon, ship.magazine);
            const destination = predictHitLocation(ship, controlWeapon, target, targetAccel);
            rotationCompensation = getShellAimVelocityCompensation(ship, controlWeapon);
            //  XY.add(
            //     getShellAimVelocityCompensation(ship, controlWeapon),
            //     XY.difference(destination, target.position),
            // );
            const range = controlWeapon.design.maxShellRange - controlWeapon.design.minShellRange;
            const rangeDiff = calcRangediff(ship, target, destination);
            trackRange = getKillZoneRadiusRange(controlWeapon);
            controlWeapon.shellRange = lerp([-range / 2, range / 2], [-1, 1], rangeDiff);
            controlWeapon.isFiring = isTargetInKillZone(ship, controlWeapon, target);
        } else {
            trackRange = [1000, 3000];
            rotationCompensation = XY.zero;
        }
        positionNearTarget(
            shipManager,
            target.velocity,
            target.position,
            rotationCompensation,
            trackRange,
            deltaSeconds,
        );
        lastTargetVelocity = XY.clone(target.velocity);
    };
    return { type: 'jouster', update, cleanup };
}
