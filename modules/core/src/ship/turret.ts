import { DesignState, SystemState, defectible } from './system';
import { capToRange, toDegreesDelta } from '../logic/formulas';
import { commandable, gameField } from '../game-field';

import { ShipState } from './ship-state';
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
};

export abstract class TurretDesignState extends DesignState implements TurretDesign {
    @gameField('float32') turnSpeed = 0;
    @gameField('float32') bearingLimit = 180;
    @gameField('float32') maxBearingSkew = 0;
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
     * where the mount is pointing right now, relative to `fittedBearing` (0 = pointing exactly
     * where it's fitted). Owned by the ship manager — command it through `bearingCommand` instead
     * of writing it.
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
     * fraction of `design.bearingLimit` this mount currently retains. Declared only where
     * `design.turnSpeed > 0` — a bolted mount has no traverse to lose.
     */
    @defectible({
        normal: 1,
        name: 'traverse limit',
        enabled: (t) => (t as Turret).design.turnSpeed > 0,
    })
    @range([0, 1])
    @gameField('float32')
    bearingLimitFactor = 1;

    /**
     * ± degrees this mount can currently traverse off its fitted bearing, after damage.
     */
    get bearingLimit() {
        return this.design.bearingLimit * this.bearingLimitFactor;
    }

    /**
     * backing store for `bearingCommand`. Never write this directly — the clamp lives in the
     * `bearingCommand` setter.
     */
    @gameField('float32')
    bearingCommandRaw = 0;

    /**
     * the bearing the mount is swinging toward, relative to `fittedBearing`. Clamped to
     * `±bearingLimit` on every write — bot, player command, GM tweak panel, future script alike —
     * so nothing can point a mount through the hull it is bolted to.
     */
    @range((t: Turret) => [-t.bearingLimit, t.bearingLimit])
    @tweakable('number')
    @commandable()
    get bearingCommand(): number {
        // clamped on read too, not just on write: a `bearingLimitFactor` drop (damage) must
        // retroactively pull an already-commanded bearing back inside the new, tighter limit.
        return capToRange(-this.bearingLimit, this.bearingLimit, this.bearingCommandRaw);
    }

    set bearingCommand(value: number) {
        this.bearingCommandRaw = capToRange(-this.bearingLimit, this.bearingLimit, value);
    }

    /**
     * this mount's bearing in relation to the ship (in degrees, 0 is front): where it's fitted,
     * plus how far damage has skewed it, plus how far it has swung from there.
     */
    get hullBearing() {
        return this.fittedBearing + this.bearingSkew + this.bearing;
    }

    /**
     * this mount's bearing in world terms. Takes `parent` explicitly — `SystemState` holds no
     * back-reference to `ShipState`.
     */
    getGlobalBearing(parent: ShipState): number {
        return parent.angle + this.hullBearing;
    }

    /**
     * this mount's bearing in world terms if it had already reached `bearingCommand` — where it is
     * currently swinging toward, not where it currently points. Used to render "asked to point
     * here" overlays ahead of the mount's swing.
     */
    getGlobalCommandedBearing(parent: ShipState): number {
        return parent.angle + this.fittedBearing + this.bearingSkew + this.bearingCommand;
    }

    /**
     * degrees per second the mount traverses in its current state. An unpowered, hacked or broken
     * mount is stuck wherever it happens to be pointing.
     */
    get turnSpeed() {
        return this.design.turnSpeed * this.effectiveness * this.turnSpeedFactor;
    }

    get broken(): boolean {
        return this.design.maxBearingSkew > 0 && Math.abs(this.bearingSkew) >= this.design.maxBearingSkew;
    }
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
