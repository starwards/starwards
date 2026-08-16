import { IterationData, Updateable } from '../updateable';
import {
    ManeuveringCommand,
    RTuple2,
    SpaceManager,
    XY,
    calcRangediff,
    capToRange,
    getShellAimVelocityCompensation,
    isInRange,
    isTargetInKillZone,
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
import { MAX_SYSTEM_HEAT } from './heat-manager';
import { PowerLevel } from './system';
import { ShipManager } from './ship-manager-abstract';
import { SmartPilotMode } from './smart-pilot';
import { SpaceObject } from '../space';
import { assertUnreachable } from '../utils';
import { switchToAvailableAmmo } from './chain-gun-manager';

/**
 * How often (game-time seconds) NPC automation re-derives `coolantFactor` for every system, from
 * the maintainer ruling on #2146/#2165: bounds the sync traffic of a `@gameField` written on every
 * system without needing a change-deadband. Not every-tick.
 */
const COOLANT_REALLOCATION_INTERVAL_SECONDS = 0.5;

/** Heat (of `MAX_SYSTEM_HEAT`) at which a gun's power backs off from `NORMAL` to `LOW` (hysteresis-latched). */
const POWER_BACKOFF_ENGAGE_HEAT = MAX_SYSTEM_HEAT * 0.6;
/** Heat the mount must cool back below before power backoff releases back to `NORMAL`. */
const POWER_BACKOFF_RELEASE_HEAT = MAX_SYSTEM_HEAT * 0.4;
/** Heat at which the ceasefire hard-stop engages — a rare backstop above where backoff bottoms out. */
const CEASEFIRE_ENGAGE_HEAT = MAX_SYSTEM_HEAT * 0.95;
/** Heat the mount must cool back below before the ceasefire latch releases (hysteresis, prevents chatter). */
const CEASEFIRE_RELEASE_HEAT = MAX_SYSTEM_HEAT * 0.7;

/**
 * Time constant for `AutomationManager`'s per-mount bearing-skew belief (see
 * `updateTrackedBearingSkew`). Not a delay on known truth — the automation never reads
 * `bearingSkew` — but a filter constant on noisy per-tick observations: each fresh observed
 * error is blended into the running belief at a rate of `1 - exp(-dt/τ)`, so it takes several
 * seconds of continued engagement for the belief to settle (~63% converged after 3s, ~95% after
 * 9s) — the same way a real gunner needs a few seconds of fire to be confident their aim is off,
 * not one glance.
 */
const BEARING_SKEW_TRACKING_TIME_CONSTANT_SECONDS = 3;

/**
 * How close a mount's mechanical `bearing` must sit to its last `bearingCommand` before an
 * observation is trusted (see `updateTrackedBearingSkew`). Tight enough to exclude any real
 * mid-swing transient (tens of degrees) while tolerating float32 round-trip noise on a mount
 * that has genuinely caught up (which, per `updateTurret`, snaps to the commanded bearing
 * exactly once within a tick's reach).
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
    /**
     * Game-time seconds accumulated toward the next coolant reallocation. Seeded with a per-ship
     * phase offset (see `manageHeat`) so NPCs don't all reallocate on the same tick.
     */
    private coolantCadenceAccumulator = 0;
    private coolantCadenceInitialized = false;
    /** Mounts currently latched into a ceasefire hard-stop, keyed by hysteresis (see `CEASEFIRE_RELEASE_HEAT`). */
    private readonly ceasefireLatched = new WeakSet<ChainGun>();
    /**
     * Mounts currently latched into power backoff (see `backOffPower`), mapped to the `power` level
     * each had the moment automation engaged. Membership is how automation knows which mounts'
     * `power` it currently owns — it must never write a mount it hasn't itself backed off, and on
     * release it restores exactly this stored level (a GM's `MAX`, a scenario's `SHUTDOWN`, ...),
     * never a hardcoded default.
     */
    private readonly powerBackoffLatched = new WeakMap<ChainGun, PowerLevel>();
    /** Escape hatch for A/B comparison (e.g. a baseline DPS run with heat management off). Defaults on. */
    private heatManagementEnabled = true;
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

    /** Test/ops-only toggle: lets a baseline run disable heat management for an A/B comparison. */
    public setHeatManagementEnabled(enabled: boolean) {
        this.heatManagementEnabled = enabled;
    }

    /** Whether `chainGun` is currently latched into the ceasefire hard-stop (see `applyCeasefireLatch`). */
    public isCeasefireLatched(chainGun: ChainGun): boolean {
        return this.ceasefireLatched.has(chainGun);
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
        weave: { offset: XY; velocity: XY } = { offset: XY.zero, velocity: XY.zero },
    ) {
        const ship = this.state;
        const shipToTarget = XY.difference(targetPosition, ship.position);
        const distanceToTarget = XY.lengthOf(shipToTarget);
        const inRange = isInRange(trackRange[0], trackRange[1], distanceToTarget);
        let maneuvering: ManeuveringCommand;
        if (inRange) {
            // matchGlobalSpeed only ever tracks a velocity, so the weave rides along as an addend to
            // the velocity it's asked to hold -- the controller drives toward the (moving) goal
            // instead of the weave being a disturbance the same controller then fights.
            maneuvering = matchGlobalSpeed(deltaSecondsAvg, ship, XY.add(targetVelocity, weave.velocity));
        } else {
            maneuvering = moveToTarget(deltaSecondsAvg, ship, XY.add(targetPosition, weave.offset));
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
        let weave: { offset: XY; velocity: XY } = { offset: XY.zero, velocity: XY.zero };
        if (fire && controlWeapon) {
            this.shipManager.setTarget(targetId);
            switchToAvailableAmmo(controlWeapon, this.state.magazine);
            const destination = predictHitLocation(this.state, controlWeapon, target);
            rotationCompensation =
                controlWeapon.bearingLimit > 0
                    ? getShellAimVelocityCompensation(this.state, controlWeapon)
                    : this.boltedGunAimCompensation(controlWeapon, target);
            const aimRange = (controlWeapon.design.maxShellRange - controlWeapon.design.minShellRange) / 2;
            const rangeDiff = calcRangediff(this.state, target, destination);
            // Position-holding needs a stable band. getKillZoneRadiusRange is keyed on
            // shellSecondsToLive, which is derived from the ship's own velocity — using it here
            // would make the approach/hold boundary chase the very velocity it's trying to
            // stabilize, chattering between the two positionNearTarget branches (issue #2083).
            // The gun's static design envelope gives a fixed band instead; the real (dynamic)
            // kill zone below still governs firing.
            trackRange = [controlWeapon.design.minShellRange, controlWeapon.design.maxShellRange];
            if (controlWeapon.shellRangeMode === SmartPilotMode.TARGET) {
                // ChainGunManager's fuze bases TARGET mode on actual distance to weaponsTarget
                // already — shellRange only carries rangeDiff's small target-motion lead correction.
                controlWeapon.shellRange = capToRange(-1, 1, rangeDiff / aimRange);
            } else {
                // DIRECT mode's own base range is a fixed midpoint of the gun's envelope, blind to
                // the real attack-order target's distance — weaponsTarget/shellRangeMode resolve off
                // player-facing visibility/radar range, an unrelated concern for an NPC's own
                // gunnery. Reconstruct the intended absolute range ourselves so a target the ship
                // isn't weapons-locked onto (yet, or ever) still gets an accurate fuze.
                const midRange = controlWeapon.design.minShellRange + aimRange;
                const actualDistance = XY.lengthOf(XY.difference(target.position, this.state.position));
                const desiredRange = capToRange(
                    controlWeapon.design.minShellRange,
                    controlWeapon.design.maxShellRange,
                    actualDistance + rangeDiff,
                );
                controlWeapon.shellRange = capToRange(-1, 1, (desiredRange - midRange) / aimRange);
            }
            controlWeapon.isFiring = isTargetInKillZone(this.state, controlWeapon, target);
            this.aimMountsAtTarget(id.deltaSecondsAvg, target);
            weave = this.combatWeave(id, target.position);
        } else {
            trackRange = [1000, 3000];
            rotationCompensation = XY.zero;
        }
        this.positionNearTarget(target.velocity, target.position, rotationCompensation, trackRange, id, weave);
        return false;
    }

    /**
     * Points every chain-gun mount at the current target, hull-relative bearing only — no lead, no
     * can't-bear handling, no per-mount fire discipline (that belongs to the deferred NPC-aiming
     * design). Compensates each mount's own observed bearing-skew belief (see
     * `updateTrackedBearingSkew`), never the true `bearingSkew` — a fresh defect is felt
     * immediately and only "dialed out" as the automation accumulates evidence that its last few
     * commands landed off-target. `bearingCommand`'s own clamp is what stops a mount from
     * swinging past the hull it is bolted to; this only ever asks.
     */
    private aimMountsAtTarget(deltaSecondsAvg: number, target: SpaceObject) {
        const hullBearing = toDegreesDelta(
            XY.angleOf(XY.difference(target.position, this.state.position)) - this.state.angle,
        );
        for (const chainGun of this.state.chainGuns) {
            const estimate = this.updateTrackedBearingSkew(chainGun, deltaSecondsAvg);
            chainGun.bearingCommand = toDegreesDelta(hullBearing - chainGun.fittedBearing - estimate);
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
        this.manageHeat(id);
    }

    /**
     * NPC-only heat management (#2175): proportional coolant allocation, power backoff and a
     * ceasefire backstop. Player ships are flown by their crew — never touched here.
     */
    private manageHeat(id: IterationData) {
        if (this.state.isPlayerShip || id.deltaSeconds <= 0 || !this.heatManagementEnabled) {
            return;
        }
        this.reallocateCoolant(id);
        for (const chainGun of this.state.chainGuns) {
            this.backOffPower(chainGun);
            this.applyCeasefireLatch(chainGun);
        }
    }

    /**
     * Sends coolant to the systems that are actually hot instead of `HeatManager`'s flat default
     * split. Runs on `COOLANT_REALLOCATION_INTERVAL_SECONDS` game-time cadence rather than every
     * tick, phase-staggered per ship (via the ship's own die, keyed on its id) so a fleet of NPCs
     * doesn't all reallocate — and all sync their `coolantFactor` — on the same tick.
     *
     * The phase offset is only sampled once, at construction-time heat; it is not reproducible
     * from the ship id alone across runs, since `ShipDie.getRoll`'s salt advances with accumulated
     * game time (see `ship-die.ts`) and this roll's actual game-time offset varies with when each
     * ship first ticks. Harmless here (only spread matters, not a specific value) — flagged so
     * nobody later assumes determinism from the key.
     */
    private reallocateCoolant({ deltaSeconds }: IterationData) {
        if (!this.coolantCadenceInitialized) {
            this.coolantCadenceInitialized = true;
            this.coolantCadenceAccumulator = this.shipManager.die.getRollInRange(
                `coolantPhase:${this.state.id}`,
                0,
                COOLANT_REALLOCATION_INTERVAL_SECONDS,
            );
        }
        this.coolantCadenceAccumulator += deltaSeconds;
        if (this.coolantCadenceAccumulator < COOLANT_REALLOCATION_INTERVAL_SECONDS) {
            return;
        }
        this.coolantCadenceAccumulator -= COOLANT_REALLOCATION_INTERVAL_SECONDS;
        for (const system of this.state.systems()) {
            // HeatManager only cares about the ratio between systems (heat-manager.ts:36-49), so
            // normalizing by MAX_SYSTEM_HEAT keeps the write within coolantFactor's declared [0,1]
            // range without changing the resulting allocation.
            system.coolantFactor = system.heat / MAX_SYSTEM_HEAT;
        }
    }

    /**
     * Duty-cycle-style power throttle: the primary defense against overheat damage, preferred over
     * the ceasefire hard-stop (see `applyCeasefireLatch`). `power` is a `PowerLevel` enum rendered
     * by name in the status UI (`system-status.ts`) — backoff must land on one of its discrete
     * values, never an arbitrary float, or the UI shows `undefined`. Caps at `LOW` (never
     * `SHUTDOWN` — a backed-off gun can still land some shots; only the ceasefire latch fully
     * silences one), hysteresis-latched between `POWER_BACKOFF_ENGAGE_HEAT` and
     * `POWER_BACKOFF_RELEASE_HEAT` so it doesn't chatter at the threshold.
     *
     * Only ever writes `power` for a mount it currently latches — a mount automation hasn't backed
     * off is left exactly as a GM or scenario set it. On release it restores the exact level that
     * mount had the moment backoff engaged (a GM's `MAX`, a scenario's `SHUTDOWN`, ...), never a
     * hardcoded default — automation undoes only what it did. A mount already at or below `LOW`
     * when it gets hot (e.g. a GM already parked it at `SHUTDOWN`) has no headroom to back off from,
     * so it never even latches.
     */
    private backOffPower(chainGun: ChainGun) {
        const preBackoffLevel = this.powerBackoffLatched.get(chainGun);
        if (preBackoffLevel !== undefined) {
            if (chainGun.heat <= POWER_BACKOFF_RELEASE_HEAT) {
                this.powerBackoffLatched.delete(chainGun);
                chainGun.power = preBackoffLevel;
            } else {
                const heldLevel: PowerLevel = Math.min(preBackoffLevel, PowerLevel.LOW);
                if (chainGun.power !== heldLevel) {
                    chainGun.power = heldLevel;
                }
            }
        } else if (chainGun.heat >= POWER_BACKOFF_ENGAGE_HEAT && chainGun.power > PowerLevel.LOW) {
            this.powerBackoffLatched.set(chainGun, chainGun.power);
            chainGun.power = PowerLevel.LOW;
        }
    }

    /**
     * Rare final backstop (per #2175's review ruling): a hysteresis-latched hard stop on `isFiring`,
     * evaluated per mount so one overheating gun never silences the others on a multi-mount hull.
     * Engages at `CEASEFIRE_ENGAGE_HEAT` — well above where power backoff already bottomed out — and
     * stays latched until the mount cools back below `CEASEFIRE_RELEASE_HEAT`, so it doesn't chatter
     * on/off around the engage threshold.
     */
    private applyCeasefireLatch(chainGun: ChainGun) {
        if (this.ceasefireLatched.has(chainGun)) {
            if (chainGun.heat <= CEASEFIRE_RELEASE_HEAT) {
                this.ceasefireLatched.delete(chainGun);
            } else {
                chainGun.isFiring = false;
            }
        } else if (chainGun.heat >= CEASEFIRE_ENGAGE_HEAT) {
            this.ceasefireLatched.add(chainGun);
            chainGun.isFiring = false;
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
