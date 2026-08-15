import { FlightProfile, makeFlightProfile } from './flight-profile';
import { IdleStrategy, Order, ShipState } from './ship-state';
import { IterationData, Updateable } from '../updateable';
import {
    ManeuveringCommand,
    RTuple2,
    SpaceManager,
    XY,
    calcRangediff,
    capToRange,
    isInRange,
    isTargetInKillZone,
    matchGlobalSpeed,
    moveToTarget,
    predictHitLocation,
    rotateToTarget,
    toDegreesDelta,
} from '../logic';

import { ChainGun } from './chain-gun';
import { DockingMode } from './docking';
import { Faction } from '../space';
import { FlightDoctrine } from './flight-doctrine';
import { ShipManager } from './ship-manager-abstract';
import { SmartPilotMode } from './smart-pilot';
import { SpaceObject } from '../space';
import { assertUnreachable } from '../utils';
import { switchToAvailableAmmo } from './chain-gun-manager';

/** How often an NPC with no ordered/cached target re-scans for a hostile to fire on. */
const GUNNERY_RESCAN_INTERVAL_SECONDS = 1;

export class AutomationManager implements Updateable {
    private gunneryTargetId: string | null = null;
    private gunneryRescanCooldown = 0;
    /**
     * Whether gunnery itself last drove `chainGuns[0].isFiring` (via `aimAndFire`). Only then does
     * disengaging reset it to `false` — a hull whose order/idleStrategy have never allowed gunnery
     * to engage (e.g. still `PLAY_DEAD`) is one gunnery has never touched, so it doesn't clobber
     * `isFiring` managed by anything else for such a hull (ammo/heat tests drive it directly).
     */
    private gunneryEngaged = false;

    /**
     * Cached so `headingOffset`'s hysteresis (avoiding heading chatter between two similarly-costed
     * candidates) survives across ticks — rebuilt only when the resolved doctrine itself changes,
     * never per tick.
     */
    private flightProfile: FlightProfile | null = null;
    private flightProfileDoctrine: FlightDoctrine | null = null;

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

    /**
     * Rebuilt only when the resolved doctrine changes, so `headingOffset`'s hysteresis (its
     * anti-chatter memory of the last heading chosen) survives across ticks instead of resetting
     * every update.
     */
    private getFlightProfile(): FlightProfile {
        const doctrine = this.state.effectiveFlightDoctrine;
        if (!this.flightProfile || this.flightProfileDoctrine !== doctrine) {
            this.flightProfile = makeFlightProfile(this.state, doctrine);
            this.flightProfileDoctrine = doctrine;
        }
        return this.flightProfile;
    }

    private positionNearTarget(
        targetVelocity: XY,
        targetPosition: XY,
        leadCompensation: XY,
        headingOffset: number,
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
        const aimPoint = inRange ? XY.add(targetPosition, leadCompensation) : targetPosition;
        const rotation = rotateToTarget(deltaSecondsAvg, ship, aimPoint, headingOffset);
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
        this.positionNearTarget(XY.zero, destination, XY.zero, 0, trackRange, id);
        return false;
    }

    private follow(fire: boolean, id: IterationData) {
        const targetId = this.state.orderTargetId;
        if (!targetId) {
            return true;
        }
        const target = this.spaceManager.state.get(targetId) || null;
        if (!target || target.destroyed || (fire && this.state.chainGuns.length === 0)) {
            return true;
        }
        this.state.currentTask = fire ? `Attack ${targetId}` : `Follow ${targetId}`;
        if (fire) {
            // Marks the UI-facing weapons-target slot for this explicit order; actual gunnery
            // (aiming/firing) is handled uniformly for every NPC by runGunnery(), not here.
            this.shipManager.setTarget(targetId);
        }
        const profile = this.getFlightProfile();
        this.positionNearTarget(
            target.velocity,
            target.position,
            profile.leadCompensation(target),
            profile.headingOffset(target),
            profile.trackRange(),
            id,
        );
        return false;
    }

    /**
     * Ship-level fire at `target`, mounts self-select — the same model already shipped for the
     * player's fire key (`writeAllProp`-broadcast `isFiring`, #2089/#2097) and for
     * `fireTubesCommand`/`consumeFireTubesCommand`: one decision for the whole ship, every mount
     * points at the target (`aimMountsAtTarget`, hull-relative bearing only — no lead, no
     * can't-bear handling, `bearingCommand`'s own clamp is what stops a mount from swinging past
     * the hull it's bolted to), and each mount's own `isTargetInKillZone` independently decides
     * whether *that* mount actually reports firing — a mount that can't bear on the target simply
     * doesn't. Still exactly one target for the whole ship per tick; mounts never split fire
     * across different targets (per-mount target selection is parked, card 5.5c).
     *
     * A future per-mount ceasefire/heat latch (#2178) needs to gate this same per-mount
     * `isFiring` assignment — the loop below — to stay consistent with `canBearOn`/
     * `anyMountCanBearOn`, which already reason per-mount rather than about `chainGuns[0]`.
     */
    private aimAndFire(target: SpaceObject) {
        this.aimMountsAtTarget(target);
        for (const chainGun of this.state.chainGuns) {
            switchToAvailableAmmo(chainGun, this.state.magazine);
            const destination = predictHitLocation(this.state, chainGun, target);
            const aimRange = (chainGun.design.maxShellRange - chainGun.design.minShellRange) / 2;
            const rangeDiff = calcRangediff(this.state, target, destination);
            if (chainGun.shellRangeMode === SmartPilotMode.TARGET) {
                // ChainGunManager's fuze bases TARGET mode on actual distance to weaponsTarget
                // already — shellRange only carries rangeDiff's small target-motion lead correction.
                chainGun.shellRange = capToRange(-1, 1, rangeDiff / aimRange);
            } else {
                // DIRECT mode's own base range is a fixed midpoint of the gun's envelope, blind to
                // the real attack-order target's distance — weaponsTarget/shellRangeMode resolve off
                // player-facing visibility/radar range, an unrelated concern for an NPC's own
                // gunnery. Reconstruct the intended absolute range ourselves so a target the ship
                // isn't weapons-locked onto (yet, or ever) still gets an accurate fuze.
                const midRange = chainGun.design.minShellRange + aimRange;
                const actualDistance = XY.lengthOf(XY.difference(target.position, this.state.position));
                const desiredRange = capToRange(
                    chainGun.design.minShellRange,
                    chainGun.design.maxShellRange,
                    actualDistance + rangeDiff,
                );
                chainGun.shellRange = capToRange(-1, 1, (desiredRange - midRange) / aimRange);
            }
            chainGun.isFiring = isTargetInKillZone(this.state, chainGun, target);
        }
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
        // Runs last so gunnery's isFiring/aim decision for this tick is never clobbered by a
        // cancelAllTasks() above (order changes, completed tasks).
        this.runGunnery(id);
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
     * Gunnery is on by default for every NPC, independent of `state.order` — orders govern
     * movement only (MOVE/FOLLOW/ATTACK/docking, including while docking/undocking — a docking
     * NPC still defends itself; nothing about docking suppresses gunnery). While `order ===
     * Order.NONE`, `idleStrategy` is the fallback: `PLAY_DEAD` holds fire, `ROAM`/`STAND_GROUND`
     * don't. Any explicit order fires regardless of `idleStrategy`.
     *
     * An `Order.ATTACK` target has absolute priority: whenever it's still structurally reachable
     * (in range and within some mount's bearing coverage — `canBearOn`, independent of the
     * mount's current in-flight bearing, so a target that's merely mid-swing-to is never treated
     * as unreachable and shoved aside), the mount commits to it every tick and only it, so the
     * swing can actually converge instead of being re-aimed at something else before it gets
     * there. Only while the ordered target is genuinely unreachable does a free opportunity shot
     * at the nearest other *reachable* hostile happen instead (`resolveOpportunityTarget` —
     * reachability-filtered so a nearer unbearable hostile never starves a bearable one further
     * out, and rescanned at most once every {@link GUNNERY_RESCAN_INTERVAL_SECONDS} on this
     * branch too, not per-tick) — never in preference to a reachable primary, never causing
     * movement, hull rotation, or a delay once the primary becomes reachable again. With no
     * ATTACK order, the nearest reachable hostile is engaged autonomously the same way, through
     * the same cache.
     *
     * Never touches position, velocity, hull angle, or `state.order`. `setTarget()` is
     * deliberately not called here (that's reserved for the explicit-order path in `follow()`),
     * so gunnery — ordered or opportunistic — never hijacks the ship's weapons-target UI slot.
     * Disengaging (`disengageGunnery`) only resets `isFiring` if gunnery itself was the one
     * driving it — a hull gunnery has never been allowed to engage (still `PLAY_DEAD`, never
     * given an order) is left alone, so `isFiring` set by anything else is never clobbered.
     */
    private runGunnery(id: IterationData) {
        if (this.state.isPlayerShip || this.state.chainGuns.length === 0) {
            return;
        }
        const firingAllowed = this.state.order !== Order.NONE || this.state.idleStrategy !== IdleStrategy.PLAY_DEAD;
        if (!firingAllowed) {
            this.disengageGunnery();
            return;
        }
        if (this.state.order === Order.ATTACK && this.state.orderTargetId) {
            const orderedTarget = this.spaceManager.state.get(this.state.orderTargetId) || null;
            if (orderedTarget && !orderedTarget.destroyed) {
                if (this.anyMountCanBearOn(orderedTarget)) {
                    this.gunneryTargetId = null;
                    this.engageGunnery(orderedTarget);
                    return;
                }
                // Primary unreachable right now: a free opportunity shot at some other reachable
                // hostile, or — with none available — keep the primary's fuze/aim dialed in
                // (ready for when it's reachable again) without ever reporting it as firing.
                const opportunityTarget = this.resolveOpportunityTarget(id, orderedTarget.id);
                this.engageGunnery(opportunityTarget ?? orderedTarget);
                return;
            }
        }
        const target = this.resolveOpportunityTarget(id);
        if (!target) {
            this.disengageGunnery();
            return;
        }
        this.engageGunnery(target);
    }

    /**
     * The ship's currently held (or freshly re-scanned) autonomous/opportunistic target: reused
     * verbatim by both the plain no-ATTACK-order path and the ATTACK-target-unreachable path, so
     * both share one cache and one {@link GUNNERY_RESCAN_INTERVAL_SECONDS} rescan cooldown — the
     * cached target is dropped, not just on destruction or leaving `maxShellRange`, but the
     * instant no mount can bear on it anymore (`anyMountCanBearOn`, which also covers
     * `minShellRange`), so a hostile no mount can bear on can never be cached in preference to —
     * and so starve — one some mount can.
     */
    private resolveOpportunityTarget(id: IterationData, excludeId?: string): SpaceObject | null {
        let target = this.gunneryTargetId ? this.spaceManager.state.get(this.gunneryTargetId) || null : null;
        if (target && (target.destroyed || target.id === excludeId || !this.anyMountCanBearOn(target))) {
            target = null;
        }
        this.gunneryRescanCooldown -= id.deltaSecondsAvg;
        if (!target && this.gunneryRescanCooldown <= 0) {
            const foundId = this.findNearestHostileTarget(excludeId, true);
            target = foundId ? this.spaceManager.state.get(foundId) || null : null;
            this.gunneryTargetId = foundId;
            this.gunneryRescanCooldown = GUNNERY_RESCAN_INTERVAL_SECONDS;
        }
        return target;
    }

    private engageGunnery(target: SpaceObject) {
        this.gunneryEngaged = true;
        this.aimAndFire(target);
    }

    private disengageGunnery() {
        if (this.gunneryEngaged) {
            for (const chainGun of this.state.chainGuns) {
                chainGun.isFiring = false;
            }
        }
        this.gunneryEngaged = false;
        this.gunneryTargetId = null;
    }

    /**
     * Whether `chainGun` could ever be pointed at `target` right now — within its own shell-range
     * envelope (including its minimum — a target inside minShellRange is as unreachable as one
     * beyond maxShellRange), and within its own bearing envelope relative to the hull's *current*
     * angle. Deliberately ignores the mount's actual in-flight bearing (which lags
     * `bearingCommand` at `turnSpeed`): this answers "is it worth committing the swing to this
     * target", not "has the swing finished yet" — the latter is what `isTargetInKillZone` (via
     * `aimAndFire`) still separately governs for the fire decision itself.
     */
    private canBearOn(chainGun: ChainGun, target: SpaceObject): boolean {
        const shipToTarget = XY.difference(target.position, this.state.position);
        const distance = XY.lengthOf(shipToTarget);
        if (distance > chainGun.design.maxShellRange || distance < chainGun.design.minShellRange) {
            return false;
        }
        const hullBearing = toDegreesDelta(XY.angleOf(shipToTarget) - this.state.angle);
        const desiredBearing = toDegreesDelta(hullBearing - chainGun.fittedBearing);
        return Math.abs(desiredBearing) <= chainGun.bearingLimit;
    }

    /**
     * A target is reachable for gunnery purposes if *any* mount can bear on it — mirroring the
     * ship-level fire model in `aimAndFire`'s doc comment: the ship makes one targeting decision,
     * individual mounts self-select. On a single-mount hull this is just `canBearOn` on that one
     * mount.
     */
    private anyMountCanBearOn(target: SpaceObject): boolean {
        return this.state.chainGuns.some((chainGun) => this.canBearOn(chainGun, target));
    }

    /**
     * Picks the nearest non-destroyed hostile-faction Spaceship, used for two different questions
     * that need two different filters:
     * - Gunnery's own target search (`requireBearable: true`, from `resolveOpportunityTarget`)
     *   must skip anything `anyMountCanBearOn` rejects — gunnery never moves or rotates to
     *   correct for a target no mount can actually point at, so a hostile no mount can bear on
     *   must never be preferred over one some mount can, regardless of distance.
     * - An NPC's ATTACK order re-acquiring after its target dies (`update()`) needs the *ship's*
     *   max range — the highest `maxShellRange` across every mount, via the flight profile's
     *   `isReachable` — not just one mount's: the order drives movement, so a target merely
     *   unbearable *right now* (mid-swing, or requiring the hull to reposition) is still a
     *   legitimate new order target, as long as *some* mount could eventually reach it.
     *
     * `excludeId` keeps it from picking an unreachable ATTACK-ordered primary right back out as
     * its own "opportunity".
     */
    private findNearestHostileTarget(excludeId?: string, requireBearable = false): string | null {
        if (this.state.chainGuns.length === 0) {
            return null;
        }
        const profile = this.getFlightProfile();
        let nearestId: string | null = null;
        let nearestDistance = Infinity;
        for (const candidate of this.spaceManager.state.getAll('Spaceship')) {
            if (
                candidate.id === this.state.id ||
                candidate.id === excludeId ||
                candidate.destroyed ||
                candidate.faction === Faction.NONE ||
                candidate.faction === this.state.faction
            ) {
                continue;
            }
            const distance = XY.lengthOf(XY.difference(candidate.position, this.state.position));
            const reachable = requireBearable
                ? this.anyMountCanBearOn(candidate)
                : profile.isReachable(candidate, distance);
            if (reachable && distance < nearestDistance) {
                nearestDistance = distance;
                nearestId = candidate.id;
            }
        }
        return nearestId;
    }
}
