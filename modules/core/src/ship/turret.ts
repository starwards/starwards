import { DesignState, SystemState, defectible } from './system';

import { commandable, gameField } from '../game-field';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { toDegreesDelta } from '../logic/formulas';
import { tweakable } from '../tweakable';

export type TurretDesign = {
    /**
     * how fast the mount traverses, in degrees per second at full effectiveness.
     * 0 for a mount that is bolted in place and always points where it was fitted.
     */
    turnSpeed: number;
};

export abstract class TurretDesignState extends DesignState implements TurretDesign {
    @gameField('float32') turnSpeed = 0;
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
 * Swings a mount toward its commanded bearing, as far as this tick's time budget allows. Takes the
 * short way around, so a mount never spins the long way to reach a bearing right next to it.
 */
export function updateTurret(turret: Turret, deltaSeconds: number) {
    const delta = toDegreesDelta(turret.directionCommand - turret.direction);
    const maxStep = turret.turnSpeed * deltaSeconds;
    if (Math.abs(delta) <= maxStep) {
        turret.direction = toDegreesDelta(turret.directionCommand);
    } else {
        turret.direction = toDegreesDelta(turret.direction + Math.sign(delta) * maxStep);
    }
}
