import { FlightDoctrine, MAX_TRANSIT_HEADING_CONCESSION } from './flight-doctrine';
import { FlightProfile, makeFlightProfile } from './flight-profile';
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
 * Horizon over which a swept heading must stay trackable: `rotationCapacity * this` is the turn
 * rate the hull could build up over it, and a measured reference rate beyond that is a step in the
 * heading, not a sweep. See {@link AutomationManager.commandHeading}.
 */
const REFERENCE_SWEEP_HORIZON_SECONDS = 1;

/**
 * Time constant for `AutomationManager`'s per-mount bearing-skew belief (see
 * {@link AutomationManager.updateTrackedBearingSkew}). Not a delay on known truth — the automation
 * never reads `bearingSkew` — but a filter constant on noisy per-tick observations: each fresh
 * observed error is blended into the running belief at a rate of `1 - exp(-dt/τ)`, so it takes
 * several seconds of continued engagement for the belief to settle (~63% converged after 3s, ~95%
 * after 9s) — the same way a real gunner needs a few seconds of fire to be confident their aim is
 * off, not one glance.
 */
const BEARING_SKEW_TRACKING_TIME_CONSTANT_SECONDS = 3;

/**
 * How close a mount's mechanical `bearing` must sit to its last `bearingCommand` before an
 * observation is trusted (see {@link AutomationManager.updateTrackedBearingSkew}). Tight enough to
 * exclude any real mid-swing transient (tens of degrees) while tolerating float32 round-trip noise
 * on a mount that has genuinely caught up (which, per `updateTurret`, snaps to the commanded
 * bearing exactly once within a tick's reach).
 */
const MOUNT_SETTLED_EPSILON_DEGREES = 0.05;

/**
 * Cheap lateral weave overlaid on attack-order steering (issue #2146): a slow sinusoid in the
 * *steering goal* (a position offset for the closing/`moveToTarget` phase, the matching velocity
 * offset for the in-range/`matchGlobalSpeed` holding phase) -- not a full evade-while-tracking
 * objective, so it stays gentle enough to keep the target in arc, and not a raw thrust/maneuvering
 * perturbation: `moveToTarget`/`matchGlobalSpeed` are themselves feedback controllers that treat any
 * velocity not aimed at their goal as error to correct, so a perturbation added on top of their
 * output gets mostly cancelled by their own next-tick correction. Retargeting the goal itself makes
 * the controller drive the weave instead of fighting it.
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
     * Whether the idle give-way turn is under way. Latched until the target is gone: "no mount can
     * bear" starts the turn but can't end it — the hull still carries turn speed when a mount first
     * comes to bear, so releasing there leaves that speed in `smartPilot.rotation` unarrested and
     * the gate re-arms once per revolution. Holding costs nothing; `rotateToAngle` commands ~0 on a
     * heading already held.
     */
    private idleGiveWayEngaged = false;
    /** Whether {@link updateIdleGiveWay} ran this tick. Owned by {@link update}'s tick housekeeping. */
    private idleGiveWayThisTick = false;
    /**
     * Per-mount belief about this mount's own bearing skew, inferred purely from observation —
     * comparing where a mount was last commanded to point against where it is actually observed
     * pointing (`ChainGun.hullBearing`). Automation-local, not ship state: an NPC brain's belief
     * about a defect it hasn't confirmed is not a property of the hardware. Keeping it off
     * `ShipState` means it costs nothing on the wire (a synced field here would dirty every tick
     * for every turret on every ship, including player ships, which never run this aiming code)
     * and it moves cleanly if automation is ever extracted client-side (see `synthetic-roster`).
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
            this.flightProfile = makeFlightProfile(this.state, doctrine);
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
            // matchGlobalSpeed only ever tracks a velocity, so the weave rides along as an addend to
            // the velocity it's asked to hold -- the controller drives toward the (moving) goal
            // instead of the weave being a disturbance the same controller then fights.
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
        ship.smartPilot.maneuvering.y = capToRange(-1, 1, maneuvering.strafe);
        ship.smartPilot.rotation = rotation;
    }

    /**
     * Cheap pseudo-random lateral weave (issue #2146): a slow sinusoid perpendicular to the
     * ship->target line, decorrelated per ship via a per-ship phase so a wave of raiders doesn't
     * weave in lockstep. Returns both the position offset (for the closing/`moveToTarget` phase) and
     * its time-derivative, the matching velocity offset (for the in-range/`matchGlobalSpeed` holding
     * phase) -- see `positionNearTarget` for why the goal itself carries the weave rather than a
     * perturbation on the controller's output. Rotation still tracks the *real* target position every
     * tick (see `positionNearTarget`'s `aimPoint`), so the mount keeps bearing on target through the
     * weave -- this only makes the hull harder to hit, not evasive.
     *
     * The phase must be constant for the ship's whole lifetime. `die.getRoll` is an *event* roll --
     * its salt rotates every `EVENT_SALT_WINDOW_SECONDS` (3s), so used as a phase it would re-roll
     * mid-engagement and shred the sinusoid into a stair-step. `die.getDrift` sampled at frequency 0
     * evaluates `noise(seed, gameTime * 0)` = `noise(seed, 0)` -- a fixed point on the seed's own
     * noise channel, i.e. a time-invariant per-ship constant, unlike an event roll.
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
        // Capped constant for this tick, decided against the route rather than thrust cost, so it
        // ignores the vector offered to it.
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
     * {@link rotateToAngle} damps against the rate *relative* to it.
     *
     * The measurement is a one-tick finite difference, so a *step* in the commanded heading (a
     * hysteresis flip, a mount switch, a target reacquire) enters it as a rate no sweep could
     * produce. Such a sample is rejected and the reference re-anchored at rate 0 — clamping would
     * assert the reference really sweeps that fast, smoothing would add lag to the very term that
     * exists to remove it. Bound: {@link REFERENCE_SWEEP_HORIZON_SECONDS}.
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
     * Skew is compensated from each mount's own *observed* belief ({@link updateTrackedBearingSkew}),
     * never the true `bearingSkew` (#2176/#2177): a fresh defect is felt immediately and only dialed
     * out as the automation accumulates evidence its last commands landed off-target.
     */
    private aimAndFire(target: SpaceObject, deltaSecondsAvg: number) {
        for (const chainGun of this.state.chainGuns) {
            switchToAvailableAmmo(chainGun, this.state.magazine);
            const { aimPoint, secondsToLive } = solveShellIntercept(this.state, chainGun, target);
            const shipToAimPoint = XY.difference(aimPoint, this.state.position);
            const hullBearing = toDegreesDelta(XY.angleOf(shipToAimPoint) - this.state.angle);
            const skewEstimate = this.updateTrackedBearingSkew(chainGun, deltaSecondsAvg);
            chainGun.bearingCommand = toDegreesDelta(hullBearing - chainGun.fittedBearing - skewEstimate);
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
            // An unreachable target needs no gate here: it outruns the shell, so over the fuze it
            // displaces further than the shell flies, and the kill zone is a few percent of that.
            // Reachability changes a decision in `canBearOn` — which target gets the swing.
            chainGun.isFiring = isTargetInKillZone(this.state, chainGun, target);
        }
    }

    /**
     * Infers `chainGun`'s bearing skew from observation — never reads `bearingSkew` — ahead of
     * overwriting `bearingCommand` with this tick's fresh command. Compares the mount-relative
     * bearing last commanded (`bearingCommand`, still holding last tick's value at this point)
     * against where the mount is actually observed pointing (`hullBearing`, which bakes in the
     * real skew). That comparison is only meaningful once the mount has physically caught up to
     * its last command — mid-swing, `bearing` hasn't reached `bearingCommand` yet, so the same
     * residual would read as a mechanical turn-lag artifact indistinguishable from skew (a fast
     * traverse across the hull, or simply tracking a moving target, would otherwise get
     * misread as damage). Settled observations blend into the running belief through the
     * exponential filter; an unsettled tick contributes nothing and leaves the belief unchanged.
     */
    private updateTrackedBearingSkew(chainGun: ChainGun, deltaSecondsAvg: number): number {
        const priorEstimate = this.trackedBearingSkew.get(chainGun) ?? 0;
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
        // returns scattered across `goto()`, the idle path and their callees, and one of them
        // missing the reset measures the reference rate across an arbitrarily long gap.
        if (!this.commandedHeadingThisTick) {
            this.lastCommandedHeading = null;
        }
        // An order (MOVE, ATTACK, docking) leaves the idle path without passing through
        // `updateIdleGiveWay`, so the latch drops here or it resumes a turn decided against a
        // situation since re-evaluated. Only the flag drops — that order owns `smartPilot.rotation`
        // this tick, so zeroing it would clobber its steering.
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
     * and never touching `smartPilot.maneuvering`, so `STAND_GROUND` still never translates. The
     * heading is held until the target is gone, not until a mount bears (see
     * {@link idleGiveWayEngaged}). Disengaging zeroes `smartPilot.rotation` rather than just ceasing
     * to write it, since nothing else on the idle path owns that field.
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
     * only, docking included (a docking NPC still defends itself). While `order === Order.NONE`,
     * `idleStrategy` is the fallback: only `PLAY_DEAD` holds fire.
     *
     * An `Order.ATTACK` target has absolute priority whenever `canBearOn` says it is structurally
     * reachable, so the mount's swing can converge instead of being re-aimed at something else
     * before it gets there. Only while that primary is unreachable does a free opportunity shot at
     * the nearest other *reachable* hostile happen instead — so a nearer unbearable hostile never
     * starves a bearable one further out, and the primary is resumed with no delay. With no ATTACK
     * order, the nearest reachable hostile is engaged the same way through the same cache.
     *
     * Resolved once per tick before `chooseAndRunTask`, so `goto()` and the idle path can turn the
     * hull toward the held target this same tick; ATTACK/FOLLOW steering is untouched, `follow()`
     * already owning heading via `FlightProfile`.
     *
     * Never touches `state.order`, `orderTargetId`, or `setTarget()` — the last is reserved for
     * `follow()`, so gunnery never hijacks the ship's weapons-target UI slot.
     */
    private resolveGunneryTarget(id: IterationData): SpaceObject | null {
        // Ticked here, not in `resolveOpportunityTarget`, which the reachable-primary branch below
        // never reaches: freezing elapsed time while a primary is engaged would throttle
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
     * bear: a target the hull hasn't turned to yet is exactly what `goto()`/the idle path steer
     * toward. `anyMountCanBearOn` separately gates whether a mount actually fires.
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
     * minimum too) and within the traverse `Turret.canBearAt` allows off its rest bearing. Ignores
     * the mount's actual in-flight bearing — this answers "is the swing worth committing", not "has
     * the swing finished", which stays `isTargetInKillZone`'s call in `aimAndFire`.
     *
     * Both tests use this mount's own intercept aim point, not the line of sight: that aim point,
     * tens of degrees off at high closing speed, is where `aimAndFire` and `gunneryHullAngle`
     * actually point the mount. A target that outruns the shell has no aim point and fails first,
     * leaving the ship free to turn or to pick a target it can actually hit.
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
        return chainGun.canBearAt(hullBearing);
    }

    /** Reachable for gunnery if *any* mount can bear — the ship-level fire model of {@link aimAndFire}. */
    private anyMountCanBearOn(target: SpaceObject): boolean {
        return this.state.chainGuns.some((chainGun) => this.canBearOn(chainGun, target));
    }

    /**
     * Nearest live hostile-faction Spaceship inside the *ship's* range envelope
     * (`FlightProfile.isReachable`), not one mount's bearing: a target merely unbearable right now
     * is a legitimate pick, since both callers need the hull free to turn toward it.
     *
     * `excludeId` keeps an unreachable ATTACK-ordered primary from being picked back out as its own
     * "opportunity".
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
