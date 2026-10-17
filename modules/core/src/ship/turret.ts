import { DesignState, SystemState, defectible } from './system';
import { atLeastThreshold, capToRange, toDegreesDelta } from '../logic/formulas';
import { commandable, gameField } from '../game-field';

import { ShipState } from './ship-state';
import { XY } from '../logic/xy';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type TurretDesign = {
    /**
     * how fast the mount traverses, in degrees per second at full effectiveness.
     * 0 (the default, used when omitted) is a mount that is bolted in place and always points
     * where it was fitted.
     */
    turnSpeed?: number;
    /**
     * ± degrees the mount can traverse off its fitted bearing. 180 (the default, used when
     * omitted) is unrestricted — a full circle either way.
     */
    bearingLimit?: number;
    /**
     * ± degrees of skew damage may impose on this mount's bearing. 0 (the default) means the
     * mount has no skew surface at all — e.g. an omni radar has no direction to bend.
     */
    maxBearingSkew?: number;
    /**
     * how far out the mount sits, as a fraction of the hull radius, along its fitted bearing (1 = on the hull edge). 0 (the default) is the
     * legacy muzzle: a point on the hull circle, along wherever the mount currently points.
     * Above 0, shells leave from this fixed point instead (e.g. a platform's edge).
     */
    mountRadiusFraction?: number;
};

export abstract class TurretDesignState extends DesignState implements TurretDesign {
    @gameField('float32') turnSpeed = 0;
    @gameField('float32') bearingLimit = 180;
    @gameField('float32') maxBearingSkew = 0;
    @gameField('float32') mountRadiusFraction = 0;
}

/**
 * `turnSpeed > 0` with `bearingLimit: 0`, or the converse, is legal, harmless and does nothing —
 * a mount that can never traverse but is "unrestricted", or one restricted to a single degree but
 * bolted in place. Neither is ever an intentional design, so it fails ship construction instead of
 * shipping a silently-wrong mount (SPEC pattern: same as `validateRepairCatalog`).
 */
export function validateTurretDesign(design: TurretDesignState, context: string): void {
    if (design.turnSpeed > 0 !== design.bearingLimit > 0) {
        throw new Error(
            `turret design "${context}" is contradictory: turnSpeed (${design.turnSpeed}) and ` +
                `bearingLimit (${design.bearingLimit}) must both be zero or both be positive`,
        );
    }
}

/**
 * A system carried on a rotating mount: it points somewhere, the crew asks it to point somewhere
 * else, and it takes time to swing between the two. What the system does once it is pointing —
 * sweep for contacts, throw bullets, push the hull — is the subsystem's business; the mount only
 * tracks bearing.
 */
export abstract class Turret extends SystemState {
    abstract readonly design: TurretDesignState;

    /**
     * index of this mount among same-type mounts on the ship (thrusters, tubes, ...). Used for
     * per-instance display only.
     */
    @gameField('int8')
    index = 0;

    /**
     * where the mount is bolted to the hull, in relation to the ship (in degrees, 0 is front).
     * `bearingLimit` is centred on this bearing, so it doesn't move once the mount is fitted.
     */
    @range(shipDirectionRange)
    @gameField('float32')
    fittedBearing = 0;

    /**
     * where the mount is pointing right now, relative to `restBearing` (0 = pointing exactly where
     * it rests). Owned by the ship manager — command it through `bearingCommand` instead of
     * writing it.
     */
    @range(shipDirectionRange)
    @tweakable('number')
    @gameField('float32')
    bearing = 0;

    /**
     * degrees damage has bent this mount off its commanded bearing. A summand, not a clamp
     * centre: it is felt even at zero turn speed (a bolted, damaged gun does not fire dead ahead),
     * and it is not bounded by `bearingLimit` — damage can point a mount outside its own design
     * arc. Declared only where `design.maxBearingSkew > 0` — a mount with no skew surface (an
     * omni radar) never shows this as a defectible.
     */
    @defectible({
        normal: 0,
        name: 'bearing skew',
        enabled: (t) => (t as Turret).design.maxBearingSkew > 0,
    })
    @range((t: Turret) => [-t.design.maxBearingSkew, t.design.maxBearingSkew])
    @gameField('float32')
    bearingSkew = 0;

    /**
     * fraction of `design.turnSpeed` this mount currently retains. Declared only where
     * `design.turnSpeed > 0` — a bolted mount has no turn speed to lose.
     */
    @defectible({
        normal: 1,
        name: 'turn speed',
        enabled: (t) => (t as Turret).design.turnSpeed > 0,
    })
    @range([0, 1])
    @gameField('float32')
    turnSpeedFactor = 1;

    /**
     * ± degrees this mount can currently traverse off its fitted bearing, after damage. Skew is the
     * one mount defectible (ADR 014 amendment, M4.18): every degree of bend costs traverse, linearly,
     * so at `|bearingSkew| = design.maxBearingSkew` the mount is bolted at `fittedBearing +
     * bearingSkew`. A mount with no skew surface keeps its full design traverse.
     */
    get bearingLimit() {
        const maxSkew = this.design.maxBearingSkew;
        if (maxSkew <= 0) {
            return this.design.bearingLimit;
        }
        return this.design.bearingLimit * Math.max(0, 1 - Math.abs(this.bearingSkew) / maxSkew);
    }

    /**
     * backing store for `bearingCommand`. Never write this directly — the clamp lives in the
     * `bearingCommand` setter.
     */
    @gameField('float32')
    bearingCommandRaw = 0;

    /**
     * the bearing the mount is swinging toward, relative to `restBearing`. Clamped to
     * `±bearingLimit` on every write — bot, player command, GM tweak panel, future script alike —
     * so nothing can point a mount through the hull it is bolted to.
     */
    @range((t: Turret) => [-t.bearingLimit, t.bearingLimit])
    @tweakable('number')
    @commandable()
    get bearingCommand(): number {
        // clamped on read too, not just on write: a skew increase (damage) narrows traverse and must
        // retroactively pull an already-commanded bearing back inside the new, tighter limit.
        return capToRange(-this.bearingLimit, this.bearingLimit, this.bearingCommandRaw);
    }

    set bearingCommand(value: number) {
        this.bearingCommandRaw = capToRange(-this.bearingLimit, this.bearingLimit, value);
    }

    /**
     * where this mount points with no traverse applied, in relation to the ship (in degrees, 0 is
     * front): where it's fitted, plus how far damage has skewed it. `bearing` and `bearingCommand`
     * are both measured from here, so the hull-relative bearings this mount can be brought to are
     * `restBearing ± bearingLimit`.
     */
    get restBearing() {
        return this.fittedBearing + this.bearingSkew;
    }

    /**
     * the `bearingCommand` that lays this mount's firing line on `targetHullBearing` (hull-relative
     * degrees, 0 is front). Past `±bearingLimit` the setter clamps it, so compare against that
     * where it matters.
     */
    bearingCommandFor(targetHullBearing: number): number {
        return toDegreesDelta(targetHullBearing - this.restBearing);
    }

    /**
     * this mount's bearing in relation to the ship (in degrees, 0 is front): where it rests, plus
     * how far it has swung from there.
     */
    get hullBearing() {
        return this.restBearing + this.bearing;
    }

    /**
     * this mount's bearing in world terms. Takes `parent` explicitly — `SystemState` holds no
     * back-reference to `ShipState`.
     */
    getGlobalBearing(parent: ShipState): number {
        return parent.angle + this.hullBearing;
    }

    /**
     * world position shells leave from, before the shell's own clearance. With the default
     * `mountRadiusFraction` 0 this is the hull circle along the mount's current bearing; otherwise a fixed
     * point `mountRadiusFraction` out from the hull centre along the fitted bearing.
     */
    getMuzzlePosition(parent: ShipState): XY {
        const offset = this.design.mountRadiusFraction * parent.radius;
        if (offset > 0) {
            return XY.add(parent.position, XY.byLengthAndDirection(offset, parent.angle + this.fittedBearing));
        }
        return XY.add(parent.position, XY.byLengthAndDirection(parent.radius, this.getGlobalBearing(parent)));
    }

    /**
     * this mount's bearing in world terms if it had already reached `bearingCommand` — where it is
     * currently swinging toward, not where it currently points. Used to render "asked to point
     * here" overlays ahead of the mount's swing.
     */
    getGlobalCommandedBearing(parent: ShipState): number {
        return parent.angle + this.restBearing + this.bearingCommand;
    }

    /**
     * degrees per second the mount traverses in its current state. An unpowered, hacked or broken
     * mount is stuck wherever it happens to be pointing.
     */
    get turnSpeed() {
        return this.design.turnSpeed * this.effectiveness * this.turnSpeedFactor;
    }

    /** Compared the way clients read both `float32` fields (see `atLeastThreshold`). */
    get broken(): boolean {
        return (
            this.design.maxBearingSkew > 0 && atLeastThreshold(Math.abs(this.bearingSkew), this.design.maxBearingSkew)
        );
    }
}

/**
 * One mount defect (M4.18 ruling): grows `|bearingSkew|` by `amount` degrees, up to
 * `design.maxBearingSkew`. Magnitude only grows — the first defect on a straight mount picks the
 * bend's direction from `sign`, later ones keep it, so damage never undoes damage. When the bend
 * grew, the mount is jolted: `bearing` jumps instantly to the edge of its new, narrower traverse
 * toward the bend. The command is untouched (still clamped), so the mount then swings back at
 * `turnSpeed` — a re-aim delay, not a jam. No-op on a mount with no skew surface.
 */
export function applySkewDefect(turret: Turret, amount: number, sign: 1 | -1) {
    const maxSkew = turret.design.maxBearingSkew;
    if (maxSkew <= 0) {
        return;
    }
    const direction = turret.bearingSkew === 0 ? sign : Math.sign(turret.bearingSkew);
    const before = Math.abs(turret.bearingSkew);
    const after = Math.min(maxSkew, before + Math.abs(amount));
    if (after <= before) {
        return;
    }
    turret.bearingSkew = direction * after;
    turret.bearing = direction * turret.bearingLimit;
}

/**
 * Swings a mount toward its commanded bearing, as far as this tick's time budget allows. Takes the
 * short way around, so a mount never spins the long way to reach a bearing right next to it. The
 * commanded bearing is already clamped to the mount's arc by `bearingCommand`'s own setter — no
 * clamp happens here.
 */
export function updateTurret(turret: Turret, deltaSeconds: number) {
    const delta = toDegreesDelta(turret.bearingCommand - turret.bearing);
    const maxStep = turret.turnSpeed * deltaSeconds;
    if (Math.abs(delta) <= maxStep) {
        turret.bearing = toDegreesDelta(turret.bearingCommand);
    } else {
        turret.bearing = toDegreesDelta(turret.bearing + Math.sign(delta) * maxStep);
    }
}
