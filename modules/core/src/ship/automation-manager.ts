import { IterationData, Updateable } from '../updateable';
import {
    ManeuveringCommand,
    RTuple2,
    SpaceManager,
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
} from '../logic';
import { Order, ShipState } from './ship-state';
import { SpaceObject } from '../space';
import { assertUnreachable } from '../utils';

import { DockingMode } from './docking';
import { ShipManager } from './ship-manager-abstract';
import { SmartPilotMode } from './smart-pilot';
import { switchToAvailableAmmo } from './chain-gun-manager';

export class AutomationManager implements Updateable {
    constructor(
        private state: ShipState,
        private shipManager: ShipManager, // TODO: use ShipApi
        private spaceManager: SpaceManager,
    ) {}

    public cancelTask() {
        this.cleanup();
    }

    private cleanup() {
        if (this.shipManager.state.currentTask) {
            this.shipManager.state.currentTask = '';
            this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
            this.shipManager.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);
            this.shipManager.state.smartPilot.rotation = 0;
            this.shipManager.state.smartPilot.maneuvering.x = 0;
            this.shipManager.state.smartPilot.maneuvering.y = 0;
            if (this.shipManager.state.chainGun) {
                this.shipManager.state.chainGun.isFiring = false;
            }
            this.shipManager.setTarget(null);
        }
    }

    private positionNearTarget(
        targetVelocity: XY,
        targetPosition: XY,
        rotationCompensation: XY,
        trackRange: RTuple2,
        { deltaSecondsAvg }: IterationData,
    ) {
        const shipToTarget = XY.difference(targetPosition, this.state.spaceObject.position);
        const distanceToTarget = XY.lengthOf(shipToTarget);
        let maneuvering: ManeuveringCommand;
        if (isInRange(trackRange[0], trackRange[1], distanceToTarget)) {
            maneuvering = matchGlobalSpeed(deltaSecondsAvg, this.state, targetVelocity);
        } else {
            maneuvering = moveToTarget(deltaSecondsAvg, this.shipManager.craft, targetPosition);
            if (distanceToTarget < trackRange[0]) {
                maneuvering.boost = -maneuvering.boost;
                maneuvering.strafe = -maneuvering.strafe;
            }
        }
        const rotation = rotateToTarget(
            deltaSecondsAvg,
            this.shipManager.craft,
            XY.add(targetPosition, rotationCompensation),
            0,
        );
        this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        this.state.smartPilot.maneuvering.x = maneuvering.boost;
        this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        this.state.smartPilot.rotation = rotation;
    }

    private goto(id: IterationData) {
        const destination = this.state.orderPosition;
        this.state.currentTask = `Go to ${destination.x},${destination.y}`;
        const trackRange: RTuple2 = [0, this.state.spaceObject.radius];
        if (
            XY.equals(this.state.spaceObject.position, destination, trackRange[1]) &&
            XY.isZero(this.state.spaceObject.velocity)
        ) {
            return true;
        }
        this.positionNearTarget(XY.zero, destination, XY.zero, trackRange, id);
        return false;
    }

    private follow(fire: boolean, id: IterationData) {
        const targetId = this.state.orderTargetId;
        if (!targetId) {
            return true;
        }
        const target = this.spaceManager.state.get(targetId) || null;
        const controlWeapon = this.state.chainGun;
        if (!target || target.destroyed || (fire && !controlWeapon)) {
            return true;
        }
        this.state.currentTask = fire ? `Attack ${targetId}` : `Follow ${targetId}`;
        let trackRange: RTuple2, rotationCompensation: XY;
        if (fire && controlWeapon) {
            this.shipManager.setTarget(targetId);
            switchToAvailableAmmo(controlWeapon, this.state.magazine);
            const destination = predictHitLocation(this.state, controlWeapon, target);
            rotationCompensation = getShellAimVelocityCompensation(this.state, controlWeapon);
            const range = controlWeapon.design.maxShellRange - controlWeapon.design.minShellRange;
            const rangeDiff = calcRangediff(this.state, target, destination);
            trackRange = getKillZoneRadiusRange(controlWeapon);
            controlWeapon.shellRange = lerp([-range / 2, range / 2], [-1, 1], rangeDiff);
            controlWeapon.isFiring = isTargetInKillZone(this.state, controlWeapon, target);
        } else {
            trackRange = [1000, 3000];
            rotationCompensation = XY.zero;
        }
        this.positionNearTarget(target.velocity, target.position, rotationCompensation, trackRange, id);
        return false;
    }

    private undock(dockingTargetId: string, dockingTarget: SpaceObject, deltaSecondsAvg: number) {
        const UndockingOvershootFactor = 1.2;
        this.state.currentTask = `Undock from  ${dockingTargetId}`;
        const diff = XY.difference(dockingTarget.position, this.state.spaceObject.position);
        const destination = XY.add(
            this.state.spaceObject.position,
            XY.byLengthAndDirection(
                this.state.docking.design.undockingTargetDistance * UndockingOvershootFactor,
                180 + XY.angleOf(diff),
            ),
        );
        const rotation = rotateToTarget(deltaSecondsAvg, this.shipManager.craft, destination, 0);
        const maneuvering = moveToTarget(deltaSecondsAvg, this.shipManager.craft, destination);
        this.state.smartPilot.maneuvering.x = maneuvering.boost;
        this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        this.state.smartPilot.rotation = rotation;
    }

    private dock(dockingTargetId: string, dockingTarget: SpaceObject, deltaSecondsAvg: number) {
        this.state.currentTask = `Dock at  ${dockingTargetId}`;
        this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const diff = XY.difference(dockingTarget.position, this.state.spaceObject.position);
        const distance = XY.lengthOf(diff) - dockingTarget.radius - this.state.spaceObject.radius;
        if (!isInRange(0.75, 0.25, distance / this.state.docking.maxDockedDistance)) {
            const targetPos = XY.add(
                this.state.spaceObject.position,
                XY.byLengthAndDirection(distance - this.state.docking.maxDockedDistance / 2, XY.angleOf(diff)),
            );
            const maneuvering = moveToTarget(deltaSecondsAvg, this.shipManager.craft, targetPos);
            this.state.smartPilot.maneuvering.x = maneuvering.boost;
            this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        } else {
            const maneuvering = matchGlobalSpeed(deltaSecondsAvg, this.state, XY.zero);
            this.state.smartPilot.maneuvering.x = maneuvering.boost;
            this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        }
        const angleRange = this.state.docking.design.width / 2;
        const angleDiff = XY.angleOf(diff) - this.state.spaceObject.angle - this.state.docking.design.angle;
        if (!isInRange(-angleRange, angleRange, toDegreesDelta(angleDiff))) {
            const offset = -this.state.docking.design.angle;
            const rotation = rotateToTarget(deltaSecondsAvg, this.shipManager.craft, dockingTarget.position, offset);
            this.state.smartPilot.rotation = rotation;
        }
    }

    update(id: IterationData): void {
        if (this.getAndApplyOrder()) {
            this.shipManager.cancelAllTasks();
        }
        if (this.chooseAndRunTask(id)) {
            this.shipManager.cancelAllTasks();
        }
    }

    private getAndApplyOrder() {
        const order = this.spaceManager.resolveObjectOrder(this.state.spaceObject.id);
        if (order) {
            if (order.type === 'none') {
                this.state.order = Order.NONE;
            } else if (order.type === 'move') {
                this.state.order = Order.MOVE;
                this.state.orderPosition.setValue(order.position);
            } else if (order.type === 'attack') {
                this.state.order = Order.ATTACK;
                this.state.orderTargetId = order.targetId;
            } else if (order.type === 'follow') {
                this.state.order = Order.FOLLOW;
                this.state.orderTargetId = order.targetId;
            }
        }
        if (typeof this.state.orderTargetId === 'string' && !this.spaceManager.state.get(this.state.orderTargetId)) {
            this.state.orderTargetId = null;
        }
        return !!order;
    }

    private chooseAndRunTask(id: IterationData) {
        if (this.state.order === Order.NONE) {
            return this.runAutoPilotRoutines(id);
        } else if (this.state.order === Order.MOVE) {
            return this.goto(id);
        } else if (this.state.order === Order.ATTACK) {
            return this.follow(true, id);
        } else if (this.state.order === Order.FOLLOW) {
            return this.follow(false, id);
        }
        assertUnreachable(this.state.order);
    }

    private runAutoPilotRoutines(id: IterationData) {
        if (this.state.docking.targetId && this.state.docking.mode !== DockingMode.DOCKED) {
            const dockingTargetId = this.state.docking.targetId;
            if (!dockingTargetId) {
                return true;
            }
            const dockingTarget = this.spaceManager.state.get(dockingTargetId) || null;
            if (!dockingTarget || dockingTarget.destroyed) {
                return true;
            }
            if (this.state.docking.mode === DockingMode.DOCKING) {
                this.spaceManager.detach(this.state.spaceObject.id);
                return this.dock(dockingTargetId, dockingTarget, id.deltaSecondsAvg);
            } else if (this.state.docking.mode === DockingMode.UNDOCKING) {
                this.spaceManager.detach(this.state.spaceObject.id);
                return this.undock(dockingTargetId, dockingTarget, id.deltaSecondsAvg);
            }
            return true;
        }
        return false;
    }
}
