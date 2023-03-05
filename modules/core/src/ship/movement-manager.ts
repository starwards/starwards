import { ManeuveringCommand, SpaceManager, XY, capToRange, limitPercisionHard, matchLocalSpeed } from '../logic';
import { SpaceObject, Spaceship } from '../space';

import { Circle } from 'detect-collisions';
import { DeepReadonly } from 'ts-essentials';
import { Die } from './ship-manager';
import { EnergyManager } from './energy-manager';
import { Iterator } from '../logic/iteration';
import { MAX_WARP_LVL } from './warp';
import { ShipState } from './ship-state';
import { SmartPilotMode } from './smart-pilot';

type ShipManager = {
    readonly weaponsTarget: SpaceObject | null;
    setSmartPilotManeuveringMode(value: SmartPilotMode): void;
    setSmartPilotRotationMode(value: SmartPilotMode): void;
    damageAllSystems(damageObject: { id: string; amount: number }): void;
};
export class MovementManager {
    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        private spaceManager: SpaceManager,
        private shipManager: ShipManager,
        private energyManager: EnergyManager,
        public die: Die
    ) {}

    update(deltaSeconds: number) {
        this.handleWarpCommands();
        this.handleWarpProximityJam();
        this.handleWarpLevel(deltaSeconds);
        this.handleWarpMovement(deltaSeconds);
        this.handleAfterburnerCommand();
        this.calcSmartPilotModes();
        this.calcStrafeAndBoost(deltaSeconds);
        this.updateRotation(deltaSeconds);
        const maneuveringAction = this.calcManeuveringAction();
        this.updateThrustersFromManeuvering(maneuveringAction, deltaSeconds);
        this.updateVelocityFromThrusters(deltaSeconds);
    }

    private handleWarpCommands() {
        if (this.state.warp.levelUpCommand) {
            this.state.warp.levelUpCommand = false;
            this.state.warp.desiredLevel = Math.min(this.state.warp.desiredLevel + 1, MAX_WARP_LVL);
        }
        if (this.state.warp.levelDownCommand) {
            this.state.warp.levelDownCommand = false;
            this.state.warp.desiredLevel = Math.max(this.state.warp.desiredLevel - 1, 0);
        }
    }

    private handleWarpProximityJam() {
        if (this.state.warp.desiredLevel > 0) {
            const queryArea = new Circle(XY.clone(this.state.position), this.state.warp.design.maxProximity);
            const objectInRange = new Iterator(this.spaceManager.spatialIndex.queryArea(queryArea))
                .filter((v) => v.id !== this.spaceObject.id && v.isCorporal)
                .firstOr(null);
            if (objectInRange) {
                this.state.warp.desiredLevel = 0;
            }
        }
    }

    private handleWarpLevel(deltaSeconds: number) {
        if (this.state.warp.desiredLevel > this.state.warp.currentLevel) {
            if (this.state.warp.currentLevel == 0) {
                const currentSpeed = XY.lengthOf(this.state.velocity);
                if (currentSpeed) {
                    // penalty damage for existing velocity
                    this.shipManager.damageAllSystems({
                        id: 'warp_start',
                        amount: this.state.warp.design.damagePerPhysicalSpeed * currentSpeed,
                    });
                }
            }
            this.state.warp.currentLevel = Math.min(
                this.state.warp.desiredLevel,
                this.state.warp.currentLevel + deltaSeconds / this.state.warp.design.chargeTime
            );
        } else if (this.state.warp.desiredLevel < this.state.warp.currentLevel) {
            this.state.warp.currentLevel = Math.max(
                0,
                this.state.warp.currentLevel - deltaSeconds / this.state.warp.design.dechargeTime
            );
            if (this.state.warp.currentLevel == 0) {
                // edge case where handleWarpMovement() will not know to set speed to 0
                this.setVelocity(XY.zero);
            }
        }
    }

    private handleWarpMovement(deltaSeconds: number) {
        if (this.isWarpActive()) {
            const newSpeed = this.state.warp.currentLevel * this.state.warp.design.speedPerLevel;
            const newVelocity = XY.byLengthAndDirection(
                this.state.warp.currentLevel * this.state.warp.design.speedPerLevel,
                this.state.angle
            );
            // penalty damage for existing velocity
            this.shipManager.damageAllSystems({
                id: 'warp_speed',
                amount: this.state.warp.damagePerWarpSpeedPerSecond * newSpeed * deltaSeconds,
            });
            this.setVelocity(newVelocity);
        }
    }

    private changeVelocity(speedToChange: XY) {
        this.spaceManager.changeVelocity(this.spaceObject.id, speedToChange);
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
    }

    private setVelocity(newSpeed: XY) {
        this.spaceManager.setVelocity(this.spaceObject.id, newSpeed);
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
    }

    private isWarpActive() {
        return !this.state.warp.broken && this.state.warp.currentLevel;
    }

    private updateRotation(deltaSeconds: number) {
        if (this.state.rotation) {
            let speedToChange = 0;
            const rotateFactor = this.state.rotation * deltaSeconds;
            const enginePower = rotateFactor * this.state.design.rotationCapacity;
            if (this.energyManager.trySpendEnergy(Math.abs(enginePower) * this.state.design.rotationEnergyCost)) {
                speedToChange += enginePower;
            }
            this.spaceManager.changeTurnSpeed(this.spaceObject.id, speedToChange);
            this.state.turnSpeed = this.spaceObject.turnSpeed;
        }
    }

    private calcSmartPilotModes() {
        if (this.state.smartPilot.broken) {
            this.shipManager.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            this.shipManager.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        }
    }

    private calcStrafeAndBoost(deltaSeconds: number) {
        if (this.isWarpActive()) {
            this.state.boost = 0;
            this.state.strafe = 0;
        } else {
            const offsetFactor =
                this.state.smartPilot.maneuveringMode === SmartPilotMode.DIRECT
                    ? 0
                    : this.state.smartPilot.offsetFactor;
            const error = XY.byLengthAndDirection(offsetFactor, this.die.getRollInRange('smartPilotOffset', -180, 180));

            let maneuveringCommand: ManeuveringCommand | undefined = undefined;
            switch (this.state.smartPilot.maneuveringMode) {
                case SmartPilotMode.DIRECT: {
                    maneuveringCommand = {
                        strafe: this.state.smartPilot.maneuvering.y,
                        boost: this.state.smartPilot.maneuvering.x,
                    };
                    break;
                }
                case SmartPilotMode.TARGET: {
                    if (this.shipManager.weaponsTarget) {
                        const velocity = XY.add(
                            XY.scale(this.state.smartPilot.maneuvering, this.state.maxSpeed),
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            this.state.globalToLocal(this.shipManager.weaponsTarget.velocity)
                        );
                        maneuveringCommand = matchLocalSpeed(deltaSeconds, this.state, velocity);
                    } else {
                        // eslint-disable-next-line no-console
                        console.error(`corrupted state: smartPilot.maneuveringMode is TARGET with no target`);
                        maneuveringCommand = { strafe: 0, boost: 0 };
                    }
                    break;
                }
                case SmartPilotMode.VELOCITY: {
                    const velocity = XY.scale(this.state.smartPilot.maneuvering, this.state.maxSpeed);
                    maneuveringCommand = matchLocalSpeed(deltaSeconds, this.state, velocity);
                    break;
                }
            }
            this.state.boost = capToRange(-1, 1, maneuveringCommand.boost + error.y);
            this.state.strafe = capToRange(-1, 1, maneuveringCommand.strafe + error.x);
        }
    }
    private updateVelocityFromThrusters(deltaSeconds: number) {
        const speedToChange = XY.sum(
            ...this.state.thrusters.map((thruster) => {
                const mvEffect =
                    thruster.active *
                    thruster.capacity *
                    thruster.availableCapacity *
                    thruster.design.speedFactor *
                    deltaSeconds;
                const abEffect = thruster.afterBurnerActive * thruster.afterBurnerCapacity * deltaSeconds;
                return XY.byLengthAndDirection(
                    mvEffect + abEffect,
                    thruster.angle + thruster.angleError + this.state.angle
                );
            })
        );
        if (!XY.isZero(speedToChange)) {
            this.changeVelocity(speedToChange);
        }
    }

    private updateThrustersFromManeuvering(maneuveringAction: XY, deltaSeconds: number) {
        for (const thruster of this.state.thrusters) {
            thruster.afterBurnerActive = 0;
            thruster.active = 0;
            const globalAngle = thruster.angle + this.state.angle;
            const desiredAction = capToRange(0, 1, XY.rotate(maneuveringAction, -globalAngle).x);
            const axisCapacity = thruster.capacity * deltaSeconds;
            if (
                this.energyManager.trySpendEnergy(desiredAction * axisCapacity * thruster.design.energyCost, thruster)
            ) {
                thruster.active = desiredAction;
            }
            if (this.state.afterBurner) {
                const axisAfterBurnerCapacity = thruster.afterBurnerCapacity * deltaSeconds;
                const desireAfterBurnedAction = Math.min(desiredAction * this.state.afterBurner, 1);
                if (this.trySpendAfterBurner(desireAfterBurnedAction * axisAfterBurnerCapacity)) {
                    thruster.afterBurnerActive = desireAfterBurnedAction;
                }
            }
        }
    }

    private trySpendAfterBurner(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative afterBurnerFuel');
        }
        if (this.state.reactor.afterBurnerFuel > value) {
            this.state.reactor.afterBurnerFuel = limitPercisionHard(this.state.reactor.afterBurnerFuel - value);
            return true;
        }
        this.state.reactor.afterBurnerFuel = 0;
        return false;
    }

    private handleAfterburnerCommand() {
        if (
            this.state.afterBurner !== this.state.afterBurnerCommand &&
            (!this.shouldEnforceMaxSpeed() || this.state.afterBurner < this.state.afterBurnerCommand)
        ) {
            this.state.afterBurner = this.state.afterBurnerCommand;
        }
    }

    private shouldEnforceMaxSpeed() {
        const maxSpeed = this.state.getMaxSpeedForAfterburner(this.state.afterBurnerCommand);
        return (
            this.state.smartPilot.maneuveringMode !== SmartPilotMode.DIRECT &&
            XY.lengthOf(this.spaceObject.velocity) > maxSpeed
        );
    }

    private calcManeuveringAction() {
        if (this.isWarpActive()) {
            return XY.zero;
        } else if (this.shouldEnforceMaxSpeed()) {
            return XY.normalize(XY.negate(this.spaceObject.velocity));
        } else {
            const boostFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle), this.state.boost);
            const strafeFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle + 90), this.state.strafe);
            const antiDriftFactor = XY.scale(
                XY.normalize(XY.negate(XY.projection(this.spaceObject.velocity, this.spaceObject.directionAxis))),
                this.state.antiDrift
            );
            const breaksFactor = XY.scale(XY.normalize(XY.negate(this.spaceObject.velocity)), this.state.breaks);
            const desiredSpeed = XY.sum(boostFactor, strafeFactor, antiDriftFactor, breaksFactor);
            return desiredSpeed;
        }
    }
}
