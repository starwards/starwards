import { DesignState, SystemState, defectible } from './system';
import { capToRange, toDegreesDelta } from '../logic/formulas';
import { commandable, gameField } from '../game-field';

import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type TurretDesign = {
    /**
     * how fast the mount traverses, in degrees per second at full effectiveness.
     * 0 for a mount that is bolted in place and always points where it was fitted.
     */
    turnSpeed: number;
    /**
     * total degrees of sweep the mount can traverse, centred on its fitted bearing.
     * 360 (the default, used when omitted) is unrestricted, matching every mount's behavior today.
     */
    arcWidth?: number;
};

export abstract class TurretDesignState extends DesignState implements TurretDesign {
    @gameField('float32') turnSpeed = 0;
    @gameField('float32') arcWidth = 360;
}

/**
 * A system carried on a rotating mount: it points somewhere, the crew asks it to point somewhere
 * else, and it takes time to swing between the two. What the system does once it is pointing —
 * sweep for contacts, throw bullets — is the subsystem's business; the mount only tracks bearing.
 */
export abstract class Turret extends SystemState {
    abstract readonly design: TurretDesignState;

    /**
     * where the mount is pointing right now, in relation to the ship (in degrees, 0 is front).
     * Owned by the ship manager — command it through `directionCommand` instead of writing it.
     */
    @range(shipDirectionRange)
    @tweakable('number')
    @gameField('float32')
    direction = 0;

    /**
     * where the mount is bolted to the hull, in relation to the ship (in degrees, 0 is front).
     * `arcWidth` is centred on this bearing, so it doesn't move once the mount is fitted.
     */
    @range(shipDirectionRange)
    @gameField('float32')
    fittedBearing = 0;

    /**
     * the bearing the mount is swinging toward, in relation to the ship (in degrees, 0 is front).
     */
    @range(shipDirectionRange)
    @tweakable('number')
    @commandable()
    @gameField('float32')
    directionCommand = 0;

    @defectible({ normal: 1, name: 'turn speed' })
    @range([0, 1])
    @gameField('float32')
    turnSpeedFactor = 1;

    /**
     * degrees per second the mount traverses in its current state. An unpowered, hacked or broken
     * mount is stuck wherever it happens to be pointing.
     */
    get turnSpeed() {
        return this.design.turnSpeed * this.effectiveness * this.turnSpeedFactor;
    }
}

/**
 * Clamps a commanded bearing into the mount's arc, so no caller (bot, player, GM tweak panel,
 * future script) can point a gun through the hull it is bolted to.
 */
function clampToArc(commanded: number, fittedBearing: number, arcWidth: number) {
    if (arcWidth >= 360) {
        return commanded;
    }
    const halfArc = arcWidth / 2;
    const offsetFromFittedBearing = capToRange(-halfArc, halfArc, toDegreesDelta(commanded - fittedBearing));
    return toDegreesDelta(fittedBearing + offsetFromFittedBearing);
}

/**
 * Swings a mount toward its commanded bearing, as far as this tick's time budget allows. Takes the
 * short way around, so a mount never spins the long way to reach a bearing right next to it.
 */
export function updateTurret(turret: Turret, deltaSeconds: number) {
    turret.directionCommand = clampToArc(turret.directionCommand, turret.fittedBearing, turret.design.arcWidth);
    const delta = toDegreesDelta(turret.directionCommand - turret.direction);
    const maxStep = turret.turnSpeed * deltaSeconds;
    if (Math.abs(delta) <= maxStep) {
        turret.direction = toDegreesDelta(turret.directionCommand);
    } else {
        turret.direction = toDegreesDelta(turret.direction + Math.sign(delta) * maxStep);
    }
}
