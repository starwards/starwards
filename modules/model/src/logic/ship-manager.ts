import { MapSchema } from '@colyseus/schema';
import {
    CannonShell,
    capToRange,
    ChainGun,
    Explosion,
    gaussianRandom,
    ShipState,
    Spaceship,
    TargetedStatus,
    Vec2,
    XY,
} from '../';
import { uniqueId } from '../id';
import { SpaceManager } from './space-manager';
import { Bot } from './bot';

export class ShipManager {
    public state = new ShipState(false); // this state tree should only be exposed by the ship room
    public bot: Bot | null = null;

    constructor(
        public spaceObject: Spaceship,
        private spaceManager: SpaceManager,
        private ships?: Map<string, ShipManager>,
        private onDestroy?: () => void
    ) {
        this.state.id = this.spaceObject.id;
        this.state.constants = new MapSchema<number>();
        this.setConstant('energyPerSecond', 5);
        this.setConstant('maxEnergy', 1000);
        this.setConstant('maxPotentialSpeed', 1000);
        this.setConstant('potentialSpeedCharge', 20);
        this.setConstant('potentialAcceleration', 100);
        this.setConstant('maneuveringCapacity', 40);
        this.setConstant('potentialSpeedEnergyCost', 0.07);
        this.setConstant('maneuveringEnergyCost', 0.07);
        this.setConstant('antiDriftEffectFactor', 1);
        this.setConstant('breaksEffectFactor', 1);
        this.setConstant('rotationEffectFactor', 0.9);
        this.setConstant('strafeEffectFactor', 0.7);
        this.setConstant('boostEffectFactor', 0.7);
        this.state.chainGun = new ChainGun();
        this.state.chainGun.constants = new MapSchema<number>();
        this.setChainGunConstant('bulletsPerSecond', 20);
        this.setChainGunConstant('bulletSpeed', 2000);
        this.setChainGunConstant('bulletDegreesDeviation', 1);
        this.setChainGunConstant('maxShellSecondsToLive', 2.5);
        this.setChainGunConstant('minShellSecondsToLive', 0.25);
        this.setChainGunConstant('explosionSecondsToLive', 0.5);
        this.setChainGunConstant('explosionExpansionSpeed', 10);
        this.setChainGunConstant('explosionDamageFactor', 20);
        this.setChainGunConstant('explosionBlastFactor', 1);
        this.setShellSecondsToLive(10);
    }

    public setStrafe(value: number) {
        this.state.strafe = capToRange(-1, 1, value);
    }

    public setBoost(value: number) {
        this.state.boost = capToRange(-1, 1, value);
    }

    public setRotation(value: number) {
        this.state.rotation = capToRange(-1, 1, value);
    }

    public setAntiDrift(value: number) {
        this.state.antiDrift = capToRange(0, 1, value);
    }

    public setBreaks(value: number) {
        this.state.breaks = capToRange(0, 1, value);
    }

    public setCombatManeuvers(value: number) {
        this.state.combatManeuvers = capToRange(0, 1, value);
    }

    public setTarget(id: string | null) {
        this.state.targetId = id;
        this.validateTargetId();
    }

    public setConstant(name: string, value: number) {
        this.state.constants.set(name, value);
    }

    public setChainGunConstant(name: string, value: number) {
        this.state.chainGun.constants.set(name, value);
    }

    public chainGun(isFiring: boolean) {
        this.state.chainGun.isFiring = isFiring;
    }

    public setShellSecondsToLive(shellSecondsToLive: number) {
        this.state.chainGun.shellSecondsToLive = capToRange(
            this.state.chainGun.minShellSecondsToLive,
            this.state.chainGun.maxShellSecondsToLive,
            shellSecondsToLive
        );
    }

    update(deltaSeconds: number) {
        if (this.spaceObject.health <= 0) {
            this.onDestroy && this.onDestroy();
        } else {
            if (this.bot) {
                this.bot(deltaSeconds, this.spaceManager.state, this);
            }
            this.validateTargetId();
            this.calcTargetedStatus();
            // sync relevant ship props
            this.syncShipProperties();
            this.updateEnergy(deltaSeconds);
            this.updateRotation(deltaSeconds);

            const desiredSpeed = this.calcDesiredSpeed();
            this.changeVelocity(desiredSpeed, deltaSeconds);

            this.updateChainGun(deltaSeconds);
            this.chargePotentialSpeed(deltaSeconds);
            this.fireChainGun();
        }
    }

    private calcDesiredSpeed() {
        const boostFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle), this.state.boost);
        const strafeFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle + 90), this.state.strafe);
        const antiDriftFactor = XY.scale(
            XY.normalize(
                XY.negate(XY.projection(this.spaceObject.velocity, XY.rotate(XY.one, this.spaceObject.angle - 90)))
            ),
            this.state.antiDrift
        );
        const breaksFactor = XY.scale(XY.normalize(XY.negate(this.spaceObject.velocity)), this.state.breaks);
        const desiredSpeed = XY.sum(boostFactor, strafeFactor, antiDriftFactor, breaksFactor);
        return desiredSpeed;
    }

    private changeVelocity(desiredSpeed: XY, deltaSeconds: number) {
        if (!XY.isZero(desiredSpeed)) {
            const maneuveringVelocity = this.useManeuvering(desiredSpeed, deltaSeconds);
            const velocityFromPotential = this.usePotentialVelocity(desiredSpeed, deltaSeconds);
            const speedToChange = XY.sum(maneuveringVelocity, velocityFromPotential);
            if (!XY.isZero(speedToChange)) {
                this.spaceManager.ChangeVelocity(this.spaceObject.id, speedToChange);
            }
        }
    }

    private usePotentialVelocity(desiredSpeed: XY, deltaSeconds: number) {
        if (this.state.combatManeuvers) {
            const velocityLength = XY.lengthOf(desiredSpeed);
            const emergencySpeed = Math.min(
                velocityLength * this.state.combatManeuvers,
                this.state.potentialAcceleration * deltaSeconds
            );
            if (this.trySpendPotentialSpeed(emergencySpeed)) {
                return XY.scale(XY.normalize(desiredSpeed), emergencySpeed);
            }
        }
        return XY.zero;
    }

    private useManeuvering(desiredSpeed: XY, deltaSeconds: number) {
        const velocityLength = XY.lengthOf(desiredSpeed);
        const maneuveringPower = Math.min(velocityLength, this.state.maneuveringCapacity * deltaSeconds);
        if (this.trySpendEnergy(maneuveringPower * this.state.maneuveringEnergyCost)) {
            const cappedSpeed = XY.scale(XY.normalize(desiredSpeed), maneuveringPower);
            const localSpeed = XY.rotate(cappedSpeed, -this.spaceObject.angle);
            const effectiveLocalSpeedChange = {
                x: localSpeed.x * this.state.boostEffectFactor,
                y: localSpeed.y * this.state.strafeEffectFactor,
            };
            const globalSpeedChange = XY.rotate(effectiveLocalSpeedChange, this.spaceObject.angle);
            return globalSpeedChange;
        }
        return XY.zero;
    }

    private chargePotentialSpeed(deltaSeconds: number) {
        if (this.state.potentialSpeed < this.state.maxPotentialSpeed) {
            const speedToChange = Math.min(
                this.state.maxPotentialSpeed - this.state.potentialSpeed,
                this.state.potentialSpeedCharge * deltaSeconds
            );
            if (this.trySpendEnergy(speedToChange * this.state.maneuveringEnergyCost)) {
                this.state.potentialSpeed += speedToChange;
            }
        }
    }

    private calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
        if (this.ships) {
            for (const shipManager of this.ships.values()) {
                if (shipManager.state.targetId === this.state.id) {
                    if (shipManager.state.chainGun.isFiring) {
                        status = TargetedStatus.FIRED_UPON;
                        break; // no need to look further
                    }
                    if (status === TargetedStatus.NONE) {
                        status = TargetedStatus.LOCKED;
                    }
                }
            }
        }
        this.state.targeted = status;
    }

    private validateTargetId() {
        if (this.state.targetId && !this.spaceManager.state.get(this.state.targetId)) {
            this.state.targetId = null;
        }
    }

    private syncShipProperties() {
        // only sync data that should be exposed to room clients
        this.state.position.x = this.spaceObject.position.x;
        this.state.position.y = this.spaceObject.position.y;
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
        this.state.turnSpeed = this.spaceObject.turnSpeed;
        this.state.angle = this.spaceObject.angle;
    }

    trySpendEnergy(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.energy > value) {
            this.state.energy = this.state.energy - value;
            return true;
        }
        return false;
    }

    trySpendPotentialSpeed(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.potentialSpeed > value) {
            this.state.potentialSpeed = this.state.potentialSpeed - value;
            return true;
        }
        return false;
    }

    private updateEnergy(deltaSeconds: number) {
        this.state.energy = capToRange(
            0,
            this.state.maxEnergy,
            this.state.energy + this.state.energyPerSecond * deltaSeconds
        );
    }

    private updateChainGun(deltaSeconds: number) {
        const chaingun = this.state.chainGun;
        if (chaingun.cooldown > 0) {
            // charge weapon
            chaingun.cooldown -= deltaSeconds * chaingun.bulletsPerSecond;
            if (!chaingun.isFiring && chaingun.cooldown < 0) {
                chaingun.cooldown = 0;
            }
        }
    }

    private getChainGunExplosion() {
        const result = new Explosion();
        result.secondsToLive = this.state.chainGun.explosionSecondsToLive;
        result.expansionSpeed = this.state.chainGun.explosionExpansionSpeed;
        result.damageFactor = this.state.chainGun.explosionDamageFactor;
        result.blastFactor = this.state.chainGun.explosionBlastFactor;
        return result;
    }

    private fireChainGun() {
        const chaingun = this.state.chainGun;
        if (chaingun.isFiring && chaingun.cooldown <= 0) {
            chaingun.cooldown += 1;
            const shell = new CannonShell(this.getChainGunExplosion());

            shell.angle = gaussianRandom(this.spaceObject.angle + chaingun.angle, chaingun.bulletDegreesDeviation);
            shell.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate({ x: chaingun.bulletSpeed, y: 0 }, shell.angle)
            );
            const shellPosition = Vec2.sum(
                this.spaceObject.position,
                XY.rotate({ x: this.spaceObject.radius + shell.radius, y: 0 }, shell.angle)
            );
            shell.init(uniqueId('shell'), shellPosition);
            shell.secondsToLive = chaingun.shellSecondsToLive;
            this.spaceManager.insert(shell);
        }
    }

    private updateRotation(deltaSeconds: number) {
        if (this.state.rotation) {
            let speedToChange = 0;
            const rotateFactor = this.state.rotation * deltaSeconds;
            const enginePower = rotateFactor * this.state.maneuveringCapacity;
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.maneuveringEnergyCost)) {
                speedToChange += enginePower * this.state.rotationEffectFactor;
            }
            if (this.state.combatManeuvers) {
                const emergencySpeed = rotateFactor * this.state.potentialAcceleration;
                if (this.trySpendPotentialSpeed(Math.abs(emergencySpeed))) {
                    speedToChange += emergencySpeed;
                }
            }
            this.spaceManager.ChangeTurnSpeed(this.spaceObject.id, speedToChange);
        }
    }
}
