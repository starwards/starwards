import { FlightDoctrine, MAX_TRANSIT_HEADING_CONCESSION } from './flight-doctrine';
import { FlightProfile, believedBearingCommandFor, believedCanBearAt, makeFlightProfile } from './flight-profile';
import { IdleStrategy, Order, ShipState } from './ship-state';
import { IterationData, Updateable } from '../updateable';
import {
    ManeuveringCommand,
    RTuple2,
    SpaceManager,
    XY,
    capToRange,
    isInRange,
    isTargetInKillZone,
    matchGlobalSpeed,
    moveToTarget,
    rotateToAngle,
    rotateToTarget,
    solveShellIntercept,
    toDegreesDelta,
} from '../logic';

import { ChainGun } from './chain-gun';
import { DockingMode } from './docking';
import { Faction } from '../space';
import { ShipManager } from './ship-manager-abstract';
import { SmartPilotMode } from './smart-pilot';
import { SpaceObject } from '../space';
import { assertUnreachable } from '../utils';
import { switchToAvailableAmmo } from './chain-gun-manager';

/** How often an NPC with no ordered/cached target re-scans for a hostile to fire on. */
const GUNNERY_RESCAN_INTERVAL_SECONDS = 1;

/**
 * Horizon over which a swept heading must stay trackable: a measured reference rate beyond
 * `rotationCapacity * this` is a step in the heading, not a sweep.
 * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
 */
const REFERENCE_SWEEP_HORIZON_SECONDS = 1;

/**
 * Filter constant on the per-mount bearing-skew belief, not a delay on known truth.
 * @see docs/SUBSYSTEMS.md#believed-bearing-skew
 */
const BEARING_SKEW_TRACKING_TIME_CONSTANT_SECONDS = 3;

/**
 * How close a mount's `bearing` must sit to its last `bearingCommand` before a skew observation is
 * trusted. Excludes any mid-swing transient (tens of degrees) while tolerating float32 noise on a
 * mount `updateTurret` has snapped exactly onto its command.
 * @see docs/SUBSYSTEMS.md#believed-bearing-skew
 */
const MOUNT_SETTLED_EPSILON_DEGREES = 0.05;

/**
 * Lateral weave overlaid on attack-order steering (#2146): a slow sinusoid in the *steering goal*,
 * gentle enough to keep the target in arc. Perturbing thrust instead would be mostly cancelled --
 * `moveToTarget`/`matchGlobalSpeed` are feedback controllers that read any velocity not aimed at
 * their goal as error. Retargeting the goal makes the controller drive the weave instead.
 */
const COMBAT_WEAVE_AMPLITUDE_METERS = 400;
const COMBAT_WEAVE_FREQUENCY_HZ = 0.08;

export class AutomationManager implements Updateable {
    private gunneryTargetId: string | null = null;
    private gunneryRescanCooldown = 0;
    /**
     * Whether gunnery itself last drove `isFiring` (via `aimAndFire`). Only then does disengaging
     * reset it — a hull gunnery has never engaged on (still `PLAY_DEAD`) may have its `isFiring`
     * driven by something else (ammo/heat tests do).
     */
    private gunneryEngaged = false;

    /** Cached across ticks so `headingOffset`'s anti-chatter hysteresis survives; rebuilt on doctrine change. */
    private flightProfile: FlightProfile | null = null;
    private flightProfileDoctrine: FlightDoctrine | null = null;
    /** Heading {@link commandHeading} last aimed at. `null` if the previous tick commanded none, so no measurement spans a gap. */
    private lastCommandedHeading: number | null = null;
    /** Whether {@link commandHeading} ran this tick. Owned by {@link update}'s tick housekeeping. */
    private commandedHeadingThisTick = false;
    /**
     * Whether the idle give-way turn is under way. Latched until the target is gone: releasing when
     * a mount first bears leaves the hull's accumulated turn speed unarrested, re-arming the gate
     * once per revolution. Holding costs nothing; `rotateToAngle` commands ~0 on a held heading.
     */
    private idleGiveWayEngaged = false;
    /** Whether {@link updateIdleGiveWay} ran this tick. Owned by {@link update}'s tick housekeeping. */
    private idleGiveWayThisTick = false;
    /**
     * Per-mount belief about this mount's own bearing skew, inferred purely from observation.
     * Automation-local so it never touches the wire, and so it moves cleanly if automation is ever
     * extracted client-side (see `synthetic-roster`).
     * @see docs/SUBSYSTEMS.md#believed-bearing-skew
     */
    private trackedBearingSkew = new Map<ChainGun, number>();

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

    private getFlightProfile(): FlightProfile {
        const doctrine = this.state.effectiveFlightDoctrine;
        if (!this.flightProfile || this.flightProfileDoctrine !== doctrine) {
            this.flightProfile = makeFlightProfile(this.state, doctrine, (gun) => this.believedBearingSkew(gun));
            this.flightProfileDoctrine = doctrine;
        }
        return this.flightProfile;
    }

    private positionNearTarget(
        targetVelocity: XY,
        targetPosition: XY,
        leadCompensation: XY,
        resolveHeadingOffset: (requiredAcceleration: XY) => number,
        trackRange: RTuple2,
        { deltaSecondsAvg }: IterationData,
        weave: { offset: XY; velocity: XY } = { offset: XY.zero, velocity: XY.zero },
    ) {
        const ship = this.state;
        const shipToTarget = XY.difference(targetPosition, ship.position);
        const distanceToTarget = XY.lengthOf(shipToTarget);
        const inRange = isInRange(trackRange[0], trackRange[1], distanceToTarget);
        let maneuvering: ManeuveringCommand;
        // Decided by the same branch that issues the thrust command, so heading arbitration can
        // never be handed a vector that disagrees with the maneuver actually being flown.
        let requiredAcceleration: XY;
        if (inRange) {
            // matchGlobalSpeed only tracks a velocity, so the weave rides along as an addend to the
            // velocity it holds rather than a disturbance it fights.
            const heldVelocity = XY.add(targetVelocity, weave.velocity);
            maneuvering = matchGlobalSpeed(deltaSecondsAvg, ship, heldVelocity);
            requiredAcceleration = XY.difference(heldVelocity, ship.velocity);
        } else {
            const wovenPosition = XY.add(targetPosition, weave.offset);
            maneuvering = moveToTarget(deltaSecondsAvg, ship, wovenPosition);
            requiredAcceleration = XY.difference(wovenPosition, ship.position);
            if (distanceToTarget < trackRange[0]) {
                maneuvering.boost = -maneuvering.boost;
                maneuvering.strafe = -maneuvering.strafe;
                requiredAcceleration = XY.negate(requiredAcceleration);
            }
        }
        const headingOffset = resolveHeadingOffset(requiredAcceleration);
        // Lead compensation grows with closing speed, so applying it while still closing couples
        // heading to velocity: the hull turns away, local-frame boost accelerates it further off
        // course -- issue #2083's runaway loop. In range, closing speed is already small.
        const aimPoint = inRange ? XY.add(targetPosition, leadCompensation) : targetPosition;
        const rotation = rotateToTarget(deltaSecondsAvg, ship, aimPoint, headingOffset);
        this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        ship.smartPilot.maneuvering.x = maneuvering.boost;
        ship.smartPilot.maneuvering.y = capToRange(-1, 1, maneuvering.strafe);
        ship.smartPilot.rotation = rotation;
    }

    /**
     * Lateral weave (#2146) perpendicular to the ship->target line, phase-decorrelated per ship so a
     * wave of raiders doesn't weave in lockstep. Returns the position offset (closing phase) and its
     * time-derivative, the velocity offset (in-range holding phase). Rotation still tracks the real
     * target position, so this makes the hull harder to hit without breaking its own aim.
     *
     * The phase must hold for the ship's whole lifetime. `die.getRoll` is an *event* roll -- its salt
     * rotates every 3s, shredding the sinusoid into a stair-step. `die.getDrift` at frequency 0 is
     * `noise(seed, 0)`, a time-invariant per-ship constant.
     */
    private combatWeave({ totalSeconds }: IterationData, targetPosition: XY): { offset: XY; velocity: XY } {
        const phase = this.shipManager.die.getDrift(`combatWeave:${this.state.id}`, 0);
        const angularFrequency = 2 * Math.PI * COMBAT_WEAVE_FREQUENCY_HZ;
        const wavePhase = totalSeconds * angularFrequency + phase * 2 * Math.PI;
        const perpendicularBearing = XY.angleOf(XY.difference(targetPosition, this.state.position)) + 90;
        return {
            offset: XY.byLengthAndDirection(COMBAT_WEAVE_AMPLITUDE_METERS * Math.sin(wavePhase), perpendicularBearing),
            velocity: XY.byLengthAndDirection(
                COMBAT_WEAVE_AMPLITUDE_METERS * angularFrequency * Math.cos(wavePhase),
                perpendicularBearing,
            ),
        };
    }

    private goto(id: IterationData, gunneryTarget: SpaceObject | null) {
        const destination = this.state.orderPosition;
        this.state.currentTask = `Go to ${destination.x},${destination.y}`;
        const trackRange: RTuple2 = [0, this.state.radius];
        if (XY.equals(this.state.position, destination, trackRange[1]) && XY.isZero(this.state.velocity)) {
            return true;
        }
        const headingOffset = this.transitHeadingConcession(destination, gunneryTarget);
        // Constant for this tick, decided against the route rather than thrust cost, so it ignores
        // the vector offered to it.
        this.positionNearTarget(XY.zero, destination, XY.zero, () => headingOffset, trackRange, id);
        if (headingOffset !== 0) {
            // The concession's reference sweeps as the target passes; `positionNearTarget`'s
            // `rotateToTarget` damps against absolute turn rate and lags it the whole pass.
            this.commandHeading(
                XY.angleOf(XY.difference(destination, this.state.position)) + headingOffset,
                id.deltaSecondsAvg,
            );
        }
        return false;
    }

    /**
     * Points the hull at `absoluteAngle`, measuring how fast that heading is itself sweeping so
     * {@link rotateToAngle} damps against the rate *relative* to it. A step in the command reads as
     * a rate past {@link REFERENCE_SWEEP_HORIZON_SECONDS} and is rejected, not clamped or smoothed.
     * @see docs/SUBSYSTEMS.md#hull-heading-arbitration
     */
    private commandHeading(absoluteAngle: number, deltaSecondsAvg: number) {
        let referenceTurnSpeed = 0;
        if (this.lastCommandedHeading !== null && deltaSecondsAvg > 0) {
            const rate = toDegreesDelta(absoluteAngle - this.lastCommandedHeading) / deltaSecondsAvg;
            const maxTrackableRate = this.state.rotationCapacity * REFERENCE_SWEEP_HORIZON_SECONDS;
            referenceTurnSpeed = Math.abs(rate) > maxTrackableRate ? 0 : rate;
        }
        this.lastCommandedHeading = absoluteAngle;
        this.commandedHeadingThisTick = true;
        this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        this.state.smartPilot.rotation = rotateToAngle(deltaSecondsAvg, this.state, absoluteAngle, referenceTurnSpeed);
    }

    /**
     * How far a MOVE order's heading gives way to bring a mount to bear on `gunneryTarget`, capped
     * at {@link MAX_TRANSIT_HEADING_CONCESSION} so a bolted-gun NPC takes beam shots but never flies
     * backwards to shoot at something behind it. `0` once some mount can already bear.
     */
    private transitHeadingConcession(destination: XY, gunneryTarget: SpaceObject | null): number {
        if (!gunneryTarget || this.anyMountCanBearOn(gunneryTarget)) {
            return 0;
        }
        const shipToDestination = XY.difference(destination, this.state.position);
        if (XY.isZero(shipToDestination)) {
            return 0;
        }
        const desiredAngle = this.getFlightProfile().gunneryHullAngle(gunneryTarget, shipToDestination);
        if (desiredAngle === null) {
            return 0;
        }
        const concession = toDegreesDelta(desiredAngle - XY.angleOf(shipToDestination));
        return capToRange(-MAX_TRANSIT_HEADING_CONCESSION, MAX_TRANSIT_HEADING_CONCESSION, concession);
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
        let weave = { offset: XY.zero, velocity: XY.zero };
        if (fire) {
            // Only marks the UI-facing weapons-target slot; aiming and firing are `aimAndFire`'s,
            // uniformly for every NPC.
            this.shipManager.setTarget(targetId);
            weave = this.combatWeave(id, target.position);
        }
        const profile = this.getFlightProfile();
        this.positionNearTarget(
            target.velocity,
            target.position,
            profile.leadCompensation(target),
            (required) => profile.headingOffset(target, required),
            profile.trackRange(),
            id,
            weave,
        );
        return false;
    }

    /**
     * Ship-level fire at `target`, mounts self-select — the same model as the player's fire key
     * (#2089/#2097) and `fireTubesCommand`: one target for the whole ship per tick, every mount
     * aimed at `solveShellIntercept`'s aim point, and each mount's own `isTargetInKillZone`
     * deciding whether *that* mount reports firing. No can't-bear handling here; `bearingCommand`'s
     * own clamp stops a mount swinging past the hull it's bolted to. Per-mount target selection is
     * parked (card 5.5c); a per-mount ceasefire/heat latch (#2178) would gate the loop below.
     *
     * Skew is compensated from each mount's own *observed* belief, never the true `bearingSkew`.
     * @see docs/SUBSYSTEMS.md#believed-bearing-skew
     */
    private aimAndFire(target: SpaceObject, deltaSecondsAvg: number) {
        for (const chainGun of this.state.chainGuns) {
            switchToAvailableAmmo(chainGun, this.state.magazine);
            const { aimPoint, secondsToLive } = solveShellIntercept(this.state, chainGun, target);
            const shipToAimPoint = XY.difference(aimPoint, this.state.position);
            const hullBearing = toDegreesDelta(XY.angleOf(shipToAimPoint) - this.state.angle);
            const skewEstimate = this.updateTrackedBearingSkew(chainGun, deltaSecondsAvg);
            chainGun.bearingCommand = believedBearingCommandFor(chainGun, hullBearing, () => skewEstimate);
            const aimRange = (chainGun.design.maxShellRange - chainGun.design.minShellRange) / 2;
            // The fuze detonates where the firing line meets the target: the *aim point's*
            // distance, not the target's. `secondsToLive` already counts from the muzzle, the
            // origin `getShellExplosionLocation` flies the shell from.
            const desiredRange = capToRange(
                chainGun.design.minShellRange,
                chainGun.design.maxShellRange,
                secondsToLive * chainGun.design.bulletSpeed,
            );
            if (chainGun.shellRangeMode === SmartPilotMode.TARGET) {
                // ChainGunManager bases TARGET mode on the actual distance to weaponsTarget already,
                // so shellRange only carries the difference the intercept adds on top of it.
                const baseRange = capToRange(
                    chainGun.design.minShellRange,
                    chainGun.design.maxShellRange,
                    XY.lengthOf(XY.difference(target.position, this.state.position)),
                );
                chainGun.shellRange = capToRange(-1, 1, (desiredRange - baseRange) / aimRange);
            } else {
                // DIRECT mode's own base range is a fixed midpoint of the gun's envelope, blind to
                // the real attack-order target's distance — weaponsTarget/shellRangeMode resolve off
                // player-facing visibility/radar range, an unrelated concern for an NPC's own
                // gunnery. Reconstruct the intended absolute range ourselves so a target the ship
                // isn't weapons-locked onto (yet, or ever) still gets an accurate fuze.
                const midRange = chainGun.design.minShellRange + aimRange;
                chainGun.shellRange = capToRange(-1, 1, (desiredRange - midRange) / aimRange);
            }
            // No unreachable-target gate needed: it outruns the shell, so it displaces further over
            // the fuze than the shell flies, well past the kill zone. Reachability only decides
            // which target gets the swing, in `canBearOn`.
            chainGun.isFiring = isTargetInKillZone(this.state, chainGun, target);
        }
    }

    /**
     * Folds one observation into `chainGun`'s skew belief, ahead of overwriting `bearingCommand`
     * with this tick's fresh command — so `bearingCommand` still holds last tick's value here.
     * An unsettled tick contributes nothing and leaves the belief unchanged.
     * @see docs/SUBSYSTEMS.md#believed-bearing-skew
     */
    private updateTrackedBearingSkew(chainGun: ChainGun, deltaSecondsAvg: number): number {
        const priorEstimate = this.believedBearingSkew(chainGun);
        const swingLag = toDegreesDelta(chainGun.bearing - chainGun.bearingCommand);
        if (Math.abs(swingLag) > MOUNT_SETTLED_EPSILON_DEGREES) {
            return priorEstimate;
        }
        const expectedHullBearing = chainGun.fittedBearing + chainGun.bearingCommand;
        const observedError = toDegreesDelta(chainGun.hullBearing - expectedHullBearing);
        const trackingFraction = 1 - Math.exp(-deltaSecondsAvg / BEARING_SKEW_TRACKING_TIME_CONSTANT_SECONDS);
        const estimate = priorEstimate + (observedError - priorEstimate) * trackingFraction;
        this.trackedBearingSkew.set(chainGun, estimate);
        return estimate;
    }

    /**
     * The current belief about `chainGun`'s skew, without advancing it. Read by the decision paths
     * ({@link canBearOn}) that run many times per tick and before `aimAndFire`, which is the single
     * site allowed to fold a fresh observation in.
     */
    private believedBearingSkew(chainGun: ChainGun): number {
        return this.trackedBearingSkew.get(chainGun) ?? 0;
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
        this.commandedHeadingThisTick = false;
        this.idleGiveWayThisTick = false;
        if (this.getAndApplyOrder()) {
            this.shipManager.cancelAllTasks();
        }
        // Resolved before chooseAndRunTask so goto()/idle steering can turn the hull toward a
        // held gunnery target this same tick, not one tick behind it.
        const gunneryTarget = this.resolveGunneryTarget(id);
        if (this.chooseAndRunTask(id, gunneryTarget)) {
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
        if (gunneryTarget) {
            this.gunneryEngaged = true;
            this.aimAndFire(gunneryTarget, id.deltaSecondsAvg);
        } else {
            this.disengageGunnery();
        }
        // Centralized rather than at each site that stops commanding a heading: those are early
        // returns scattered across `goto()` and the idle path, and one missing the reset would
        // measure the reference rate across an arbitrarily long gap.
        if (!this.commandedHeadingThisTick) {
            this.lastCommandedHeading = null;
        }
        // An order (MOVE, ATTACK, docking) never passes through `updateIdleGiveWay`, so the latch
        // drops here or it resumes a turn decided against a situation since re-evaluated. Only the
        // flag drops — that order owns `smartPilot.rotation` this tick.
        if (!this.idleGiveWayThisTick) {
            this.idleGiveWayEngaged = false;
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

    private chooseAndRunTask(id: IterationData, gunneryTarget: SpaceObject | null) {
        // Clear stale orders on player ships (e.g., carried over from NPC→PC conversion)
        if (this.state.isPlayerShip && this.state.order !== Order.NONE) {
            this.state.order = Order.NONE;
            this.state.orderTargetId = null;
            this.state.orderPosition.setValue(XY.zero);
            return false;
        }
        if (this.state.order === Order.NONE) {
            return this.runAutoPilotRoutines(id, gunneryTarget);
        } else if (this.state.order === Order.MOVE) {
            return this.goto(id, gunneryTarget);
        } else if (this.state.order === Order.ATTACK) {
            return this.follow(true, id);
        } else if (this.state.order === Order.FOLLOW) {
            return this.follow(false, id);
        }
        assertUnreachable(this.state.order);
    }

    private runAutoPilotRoutines(id: IterationData, gunneryTarget: SpaceObject | null) {
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
        this.updateIdleGiveWay(gunneryTarget, id.deltaSecondsAvg);
        return false;
    }

    /**
     * The idle give-way turn: an idle NPC (`ROAM`/`STAND_GROUND`) holding a gunnery target no mount
     * can bear on turns to face it — doctrine-weighted, uncapped since no route is being given up,
     * and never touching `smartPilot.maneuvering`, so `STAND_GROUND` still never translates. Held
     * until the target is gone (see {@link idleGiveWayEngaged}). Disengaging zeroes
     * `smartPilot.rotation`, since nothing else on the idle path owns that field.
     */
    private updateIdleGiveWay(gunneryTarget: SpaceObject | null, deltaSecondsAvg: number) {
        this.idleGiveWayThisTick = true;
        if (!gunneryTarget) {
            if (this.idleGiveWayEngaged) {
                this.idleGiveWayEngaged = false;
                this.state.smartPilot.rotation = 0;
            }
            return;
        }
        if (!this.anyMountCanBearOn(gunneryTarget)) {
            this.idleGiveWayEngaged = true;
        }
        if (!this.idleGiveWayEngaged) {
            return;
        }
        const shipToTarget = XY.difference(gunneryTarget.position, this.state.position);
        if (XY.isZero(shipToTarget)) {
            return;
        }
        const desiredAngle = this.getFlightProfile().gunneryHullAngle(gunneryTarget, shipToTarget);
        if (desiredAngle !== null) {
            this.commandHeading(desiredAngle, deltaSecondsAvg);
        }
    }

    /**
     * Gunnery is on by default for every NPC, independent of `state.order` — orders govern movement
     * only, docking included (a docking NPC still defends itself).
     *
     * An `Order.ATTACK` target has absolute priority whenever `canBearOn` says it is structurally
     * reachable, so the mount's swing can converge instead of being re-aimed before it gets there.
     * Only while that primary is unreachable does a free opportunity shot at the nearest other
     * *reachable* hostile happen instead.
     *
     * Resolved once per tick before `chooseAndRunTask`, so `goto()` and the idle path can turn the
     * hull toward the held target this same tick. Never touches `state.order`, `orderTargetId`, or
     * `setTarget()` — the last is `follow()`'s, so gunnery never hijacks the weapons-target UI slot.
     * @see docs/SUBSYSTEMS.md#gunnery
     */
    private resolveGunneryTarget(id: IterationData): SpaceObject | null {
        // Ticked here, not in `resolveOpportunityTarget`, which the reachable-primary branch below
        // never reaches: freezing the clock while a primary is engaged would throttle
        // re-acquisition for a full interval the moment that primary dies.
        this.gunneryRescanCooldown -= id.deltaSecondsAvg;
        if (this.state.isPlayerShip || this.state.chainGuns.length === 0) {
            return null;
        }
        const firingAllowed = this.state.order !== Order.NONE || this.state.idleStrategy !== IdleStrategy.PLAY_DEAD;
        if (!firingAllowed) {
            return null;
        }
        if (this.state.order === Order.ATTACK && this.state.orderTargetId) {
            const orderedTarget = this.spaceManager.state.get(this.state.orderTargetId) || null;
            if (orderedTarget && !orderedTarget.destroyed) {
                if (this.anyMountCanBearOn(orderedTarget)) {
                    this.gunneryTargetId = null;
                    return orderedTarget;
                }
                // Primary unreachable: take a free opportunity shot, or with none available keep
                // the primary's fuze/aim dialed in without ever reporting it as firing.
                const opportunityTarget = this.resolveOpportunityTarget(orderedTarget.id);
                return opportunityTarget ?? orderedTarget;
            }
        }
        return this.resolveOpportunityTarget();
    }

    /**
     * The ship's currently held (or freshly re-scanned) opportunistic target — one cache and one
     * {@link GUNNERY_RESCAN_INTERVAL_SECONDS} cooldown shared by both callers. Dropped on
     * destruction or on leaving the ship's gun-range envelope, but *not* the instant no mount can
     * bear: a target the hull hasn't turned to yet is what `goto()`/the idle path steer toward.
     */
    private resolveOpportunityTarget(excludeId?: string): SpaceObject | null {
        const profile = this.getFlightProfile();
        let target = this.gunneryTargetId ? this.spaceManager.state.get(this.gunneryTargetId) || null : null;
        if (target) {
            const distance = XY.lengthOf(XY.difference(target.position, this.state.position));
            if (target.destroyed || target.id === excludeId || !profile.isReachable(distance)) {
                target = null;
            }
        }
        if (!target && this.gunneryRescanCooldown <= 0) {
            const foundId = this.findNearestHostileTarget(excludeId);
            target = foundId ? this.spaceManager.state.get(foundId) || null : null;
            this.gunneryTargetId = foundId;
            this.gunneryRescanCooldown = GUNNERY_RESCAN_INTERVAL_SECONDS;
        }
        return target;
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
     * Whether `chainGun` could be pointed at `target` at all: inside its shell-range envelope (its
     * minimum too) and within its believed traverse. Ignores the mount's actual in-flight bearing —
     * this answers "is the swing worth committing", not "has the swing finished", which stays
     * `isTargetInKillZone`'s call in `aimAndFire`. Both tests use this mount's own intercept aim
     * point, tens of degrees off the line of sight at high closing speed, because that is where
     * `aimAndFire` and `gunneryHullAngle` actually point it.
     */
    private canBearOn(chainGun: ChainGun, target: SpaceObject): boolean {
        const { aimPoint, reachable } = solveShellIntercept(this.state, chainGun, target);
        if (!reachable) {
            return false;
        }
        const shipToAimPoint = XY.difference(aimPoint, this.state.position);
        const distance = XY.lengthOf(shipToAimPoint);
        if (distance > chainGun.design.maxShellRange || distance < chainGun.design.minShellRange) {
            return false;
        }
        const hullBearing = toDegreesDelta(XY.angleOf(shipToAimPoint) - this.state.angle);
        // Not `Turret.bearingCommandFor`, which measures traverse off the *true* `restBearing`.
        // see: docs/SUBSYSTEMS.md#believed-bearing-skew
        return believedCanBearAt(chainGun, hullBearing, (gun) => this.believedBearingSkew(gun));
    }

    /** Reachable for gunnery if *any* mount can bear — the ship-level fire model of {@link aimAndFire}. */
    private anyMountCanBearOn(target: SpaceObject): boolean {
        return this.state.chainGuns.some((chainGun) => this.canBearOn(chainGun, target));
    }

    /**
     * Nearest live hostile-faction Spaceship inside the *ship's* range envelope
     * (`FlightProfile.isReachable`), not one mount's bearing: a target merely unbearable right now
     * is a legitimate pick, since both callers need the hull free to turn toward it. `excludeId`
     * keeps an unreachable ATTACK-ordered primary from being picked back out as its own opportunity.
     */
    private findNearestHostileTarget(excludeId?: string): string | null {
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
            const reachable = profile.isReachable(distance);
            if (reachable && distance < nearestDistance) {
                nearestDistance = distance;
                nearestId = candidate.id;
            }
        }
        return nearestId;
    }
}
