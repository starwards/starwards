import { IterationData, Updateable } from '../updateable';
import {
    ManeuveringCommand,
    RTuple2,
    SpaceManager,
    XY,
    calcRangediff,
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

import { ChainGun } from './chain-gun';
import { DockingMode } from './docking';
import { Faction } from '../space';
import { ShipManager } from './ship-manager-abstract';
import { SmartPilotMode } from './smart-pilot';
import { SpaceObject } from '../space';
import { assertUnreachable } from '../utils';
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
            for (const chainGun of this.shipManager.state.chainGuns) {
                chainGun.isFiring = false;
            }
            this.shipManager.setTarget(null);
        }
    }

    private clearOrder() {
        this.shipManager.state.order = Order.NONE;
        this.shipManager.state.orderTargetId = null;
        this.shipManager.state.orderPosition.setValue(XY.zero);
    }

    private positionNearTarget(
        targetVelocity: XY,
        targetPosition: XY,
        rotationCompensation: XY,
        trackRange: RTuple2,
        { deltaSecondsAvg }: IterationData,
    ) {
        const ship = this.state;
        const shipToTarget = XY.difference(targetPosition, ship.position);
        const distanceToTarget = XY.lengthOf(shipToTarget);
        const inRange = isInRange(trackRange[0], trackRange[1], distanceToTarget);
        let maneuvering: ManeuveringCommand;
        if (inRange) {
            maneuvering = matchGlobalSpeed(deltaSecondsAvg, ship, targetVelocity);
        } else {
            maneuvering = moveToTarget(deltaSecondsAvg, ship, targetPosition);
            if (distanceToTarget < trackRange[0]) {
                maneuvering.boost = -maneuvering.boost;
                maneuvering.strafe = -maneuvering.strafe;
            }
        }
        // Shell-aim lead compensation grows with the ship's own closing speed. Applying it to hull
        // facing while still closing distance couples heading to velocity: a fast approach turns the
        // hull away from the target, which (via local-frame boost) accelerates it further off course —
        // a runaway feedback loop (issue #2083). It only makes sense once the ship is holding station
        // in range, where closing speed toward the target is already small.
        const aimPoint = inRange ? XY.add(targetPosition, rotationCompensation) : targetPosition;
        const rotation = rotateToTarget(deltaSecondsAvg, ship, aimPoint, 0);
        this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        ship.smartPilot.maneuvering.x = maneuvering.boost;
        ship.smartPilot.maneuvering.y = maneuvering.strafe;
        ship.smartPilot.rotation = rotation;
    }

    private goto(id: IterationData) {
        const destination = this.state.orderPosition;
        this.state.currentTask = `Go to ${destination.x},${destination.y}`;
        const trackRange: RTuple2 = [0, this.state.radius];
        if (XY.equals(this.state.position, destination, trackRange[1]) && XY.isZero(this.state.velocity)) {
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
        const controlWeapon = this.state.chainGuns[0] ?? null;
        if (!target || target.destroyed || (fire && !controlWeapon)) {
            return true;
        }
        this.state.currentTask = fire ? `Attack ${targetId}` : `Follow ${targetId}`;
        let trackRange: RTuple2, rotationCompensation: XY;
        if (fire && controlWeapon) {
            this.shipManager.setTarget(targetId);
            switchToAvailableAmmo(controlWeapon, this.state.magazine);
            const destination = predictHitLocation(this.state, controlWeapon, target);
            rotationCompensation =
                controlWeapon.bearingLimit > 0
                    ? getShellAimVelocityCompensation(this.state, controlWeapon)
                    : this.boltedGunAimCompensation(controlWeapon, target);
            const range = controlWeapon.design.maxShellRange - controlWeapon.design.minShellRange;
            const rangeDiff = calcRangediff(this.state, target, destination);
            // Position-holding needs a stable band. getKillZoneRadiusRange is keyed on
            // shellSecondsToLive, which is derived from the ship's own velocity — using it here
            // would make the approach/hold boundary chase the very velocity it's trying to
            // stabilize, chattering between the two positionNearTarget branches (issue #2083).
            // The gun's static design envelope gives a fixed band instead; the real (dynamic)
            // kill zone below still governs firing.
            trackRange = [controlWeapon.design.minShellRange, controlWeapon.design.maxShellRange];
            controlWeapon.shellRange = lerp([-range / 2, range / 2], [-1, 1], rangeDiff);
            controlWeapon.isFiring = isTargetInKillZone(this.state, controlWeapon, target);
            this.aimMountsAtTarget(target);
        } else {
            trackRange = [1000, 3000];
            rotationCompensation = XY.zero;
        }
        this.positionNearTarget(target.velocity, target.position, rotationCompensation, trackRange, id);
        return false;
    }

    /**
     * Points every chain-gun mount at the current target, hull-relative bearing only — no lead, no
     * can't-bear handling, no per-mount fire discipline (that belongs to the deferred NPC-aiming
     * design). `bearingCommand`'s own clamp is what stops a mount from swinging past the hull it
     * is bolted to; this only ever asks.
     */
    private aimMountsAtTarget(target: SpaceObject) {
        const hullBearing = toDegreesDelta(
            XY.angleOf(XY.difference(target.position, this.state.position)) - this.state.angle,
        );
        for (const chainGun of this.state.chainGuns) {
            chainGun.bearingCommand = toDegreesDelta(hullBearing - chainGun.fittedBearing);
        }
    }

    /**
     * A mount with no traverse left (bolted by design, or a turret whose `bearingLimitFactor` was
     * damaged to 0) can't correct its own aim — `bearingCommand` always clamps to 0, so its global
     * bearing is locked to `ship.angle + fittedBearing`. Bringing it to bear is the hull's job: aim
     * the hull at the target rotated by `-fittedBearing`, so the muzzle (not the bow) ends up on the
     * firing line. Returned as a `positionNearTarget`-style offset added to the target's position,
     * matching `getShellAimVelocityCompensation`'s shape for the traversable-mount case.
     */
    private boltedGunAimCompensation(chainGun: ChainGun, target: SpaceObject): XY {
        const shipToTarget = XY.difference(target.position, this.state.position);
        const aimPoint = XY.add(this.state.position, XY.rotate(shipToTarget, -chainGun.fittedBearing));
        return XY.difference(aimPoint, target.position);
    }

    private undock(dockingTargetId: string, dockingTarget: SpaceObject, deltaSecondsAvg: number) {
        const UndockingOvershootFactor = 1.2;
        this.state.currentTask = `Undock from  ${dockingTargetId}`;
        const diff = XY.difference(dockingTarget.position, this.state.position);
        const destination = XY.add(
            this.state.position,
            XY.byLengthAndDirection(
                this.state.docking.design.undockingTargetDistance * UndockingOvershootFactor,
                180 + XY.angleOf(diff),
            ),
        );
        const rotation = rotateToTarget(deltaSecondsAvg, this.state, destination, 0);
        const maneuvering = moveToTarget(deltaSecondsAvg, this.state, destination);
        this.state.smartPilot.maneuvering.x = maneuvering.boost;
        this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        this.state.smartPilot.rotation = rotation;
    }

    private dock(dockingTargetId: string, dockingTarget: SpaceObject, deltaSecondsAvg: number) {
        this.state.currentTask = `Dock at  ${dockingTargetId}`;
        this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        const diff = XY.difference(dockingTarget.position, this.state.position);
        const distance = XY.lengthOf(diff) - dockingTarget.radius - this.state.radius;
        if (!isInRange(0.75, 0.25, distance / this.state.docking.maxDockedDistance)) {
            const targetPos = XY.add(
                this.state.position,
                XY.byLengthAndDirection(distance - this.state.docking.maxDockedDistance / 2, XY.angleOf(diff)),
            );
            const maneuvering = moveToTarget(deltaSecondsAvg, this.state, targetPos);
            this.state.smartPilot.maneuvering.x = maneuvering.boost;
            this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        } else {
            const maneuvering = matchGlobalSpeed(deltaSecondsAvg, this.state, XY.zero);
            this.state.smartPilot.maneuvering.x = maneuvering.boost;
            this.state.smartPilot.maneuvering.y = maneuvering.strafe;
        }
        const angleRange = this.state.docking.design.width / 2;
        const angleDiff = XY.angleOf(diff) - this.state.angle - this.state.docking.design.angle;
        if (!isInRange(-angleRange, angleRange, toDegreesDelta(angleDiff))) {
            const offset = -this.state.docking.design.angle;
            const rotation = rotateToTarget(deltaSecondsAvg, this.state, dockingTarget.position, offset);
            this.state.smartPilot.rotation = rotation;
        }
    }

    update(id: IterationData): void {
        if (this.getAndApplyOrder()) {
            this.shipManager.cancelAllTasks();
        }
        if (this.chooseAndRunTask(id)) {
            const reacquiredTargetId =
                !this.state.isPlayerShip && this.state.order === Order.ATTACK ? this.findNearestHostileTarget() : null;
            this.shipManager.cancelAllTasks();
            if (reacquiredTargetId) {
                this.state.orderTargetId = reacquiredTargetId;
            } else {
                this.clearOrder();
            }
        }
    }

    private getAndApplyOrder() {
        const order = this.spaceManager.resolveObjectOrder(this.state.id);
        if (order) {
            // Player ships ignore GM orders - players control their own ships
            if (this.state.isPlayerShip) {
                return false;
            }
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
        // Clear stale orders on player ships (e.g., carried over from NPC→PC conversion)
        if (this.state.isPlayerShip && this.state.order !== Order.NONE) {
            this.state.order = Order.NONE;
            this.state.orderTargetId = null;
            this.state.orderPosition.setValue(XY.zero);
            return false;
        }
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
                this.spaceManager.detach(this.state.id);
                return this.dock(dockingTargetId, dockingTarget, id.deltaSecondsAvg);
            } else if (this.state.docking.mode === DockingMode.UNDOCKING) {
                this.spaceManager.detach(this.state.id);
                return this.undock(dockingTargetId, dockingTarget, id.deltaSecondsAvg);
            }
            return true;
        }
        return false;
    }

    /**
     * Picks the nearest non-destroyed hostile-faction Spaceship within the ship's own chain-gun
     * range, so an NPC whose ATTACK order just completed (target destroyed or gone) re-engages
     * instead of sitting dead in the water. Only consulted at that transition — an NPC that was
     * never given an order stays idle, per the GameApi contract that scripts gate engagement. No
     * weapon, no threat routine — an unarmed NPC has nothing to re-acquire for.
     */
    private findNearestHostileTarget(): string | null {
        const controlWeapon = this.state.chainGuns[0] ?? null;
        if (!controlWeapon) {
            return null;
        }
        const engagementRadius = controlWeapon.design.maxShellRange;
        let nearestId: string | null = null;
        let nearestDistance = Infinity;
        for (const candidate of this.spaceManager.state.getAll('Spaceship')) {
            if (
                candidate.id === this.state.id ||
                candidate.destroyed ||
                candidate.faction === Faction.NONE ||
                candidate.faction === this.state.faction
            ) {
                continue;
            }
            const distance = XY.lengthOf(XY.difference(candidate.position, this.state.position));
            if (distance <= engagementRadius && distance < nearestDistance) {
                nearestDistance = distance;
                nearestId = candidate.id;
            }
        }
        return nearestId;
    }
}
