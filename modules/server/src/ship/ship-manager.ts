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
} from '@starwards/model';
import { uniqueId } from '../id';
import { SpaceManager } from '../space/space-manager';
import { Bot } from './bot';

export class ShipManager {
    public state = new ShipState(false); // this state tree should only be exposed by the ship room
    public bot: Bot | null = null;

    constructor(
        public spaceObject: Spaceship,
        private spaceManager: SpaceManager,
        private ships: Map<string, ShipManager>,
        private onDestroy: () => void
    ) {
        this.state.id = this.spaceObject.id;
        this.state.constants = new MapSchema<number>();
        this.state.constants.energyPerSecond = 5;
        this.state.constants.maxEnergy = 1000;
        this.state.constants.maneuveringCapacity = 150;
        this.state.constants.maneuveringEnergyCost = 0.07;
        this.state.constants.antiDriftEffectFactor = 1;
        this.state.constants.breaksEffectFactor = 1;
        this.state.constants.rotationEffectFactor = 0.75;
        this.state.constants.strafeEffectFactor = 0.7;
        this.state.constants.boostEffectFactor = 0.7;
        this.state.constants.impulseEnergyCost = 0.3;
        this.state.constants.impulseEffectFactor = 4;
        this.state.chainGun = new ChainGun();
        this.state.chainGun.constants = new MapSchema<number>();
        this.state.chainGun.constants.bulletsPerSecond = 20;
        this.state.chainGun.constants.bulletSpeed = 2000;
        this.state.chainGun.constants.bulletDegreesDeviation = 1;
        this.state.chainGun.constants.maxShellSecondsToLive = 2.5;
        this.state.chainGun.constants.minShellSecondsToLive = 0.25;
        this.state.chainGun.constants.explosionSecondsToLive = 0.5;
        this.state.chainGun.constants.explosionExpansionSpeed = 10;
        this.state.chainGun.constants.explosionDamageFactor = 20;
        this.state.chainGun.constants.explosionBlastFactor = 1;
        this.setShellSecondsToLive(10);
    }

    public setImpulse(value: number) {
        this.state.impulse = value;
    }

    public setStrafe(value: number) {
        this.state.strafe = capToRange(-5, 5, value);
    }

    public setBoost(value: number) {
        this.state.boost = capToRange(-5, 5, value);
    }

    public setRotation(value: number) {
        this.state.rotation = capToRange(-1, 1, value);
    }

    public setAntiDrift(value: number) {
        this.state.antiDrift = value;
    }

    public setBreaks(value: number) {
        this.state.breaks = value;
    }
    public setTarget(id: string | null) {
        this.state.targetId = id;
        this.validateTargetId();
    }

    public setConstant(name: string, value: number) {
        this.state.constants[name] = value;
    }

    public setChainGunConstant(name: string, value: number) {
        this.state.chainGun.constants[name] = value;
    }

    public chainGun(isFiring: boolean) {
        this.state.chainGun.isFiring = isFiring;
    }

    public setShellSecondsToLive(shellSecondsToLive: number) {
        this.state.chainGun.shellSecondsToLive = capToRange(
            this.state.chainGun.constants.minShellSecondsToLive,
            this.state.chainGun.constants.maxShellSecondsToLive,
            shellSecondsToLive
        );
    }

    update(deltaSeconds: number) {
        if (this.spaceObject.health <= 0) {
            this.onDestroy();
        } else {
            if (this.bot) {
                this.bot(this.spaceManager.state, this, deltaSeconds);
            }
            this.validateTargetId();
            this.calcTargetedStatus();
            // sync relevant ship props
            this.syncShipProperties();
            this.updateEnergy(deltaSeconds);
            this.updateTurnSpeed(deltaSeconds);
            this.updateBoost(deltaSeconds);
            this.updateStrafe(deltaSeconds);
            this.updateAntiDrift(deltaSeconds);
            this.updateBreaks(deltaSeconds);
            this.updateImpulse(deltaSeconds);
            this.updateChainGun(deltaSeconds);
            this.fireChainGun();
        }
    }

    private calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
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

    private updateEnergy(deltaSeconds: number) {
        this.state.energy = capToRange(
            0,
            this.state.constants.maxEnergy,
            this.state.energy + this.state.constants.energyPerSecond * deltaSeconds
        );
    }

    private updateChainGun(deltaSeconds: number) {
        const chaingun = this.state.chainGun;
        if (chaingun.cooldown > 0) {
            // charge weapon
            chaingun.cooldown -= deltaSeconds * chaingun.constants.bulletsPerSecond;
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

            shell.angle = gaussianRandom(
                this.spaceObject.angle + chaingun.angle,
                chaingun.constants.bulletDegreesDeviation
            );
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

    private updateImpulse(deltaSeconds: number) {
        if (this.state.impulse) {
            if (
                this.trySpendEnergy(
                    Math.abs(this.state.impulse) * deltaSeconds * this.state.constants.impulseEnergyCost
                )
            ) {
                this.spaceManager.ChangeVelocity(
                    this.spaceObject.id,
                    XY.rotate(
                        { x: this.state.impulse * deltaSeconds * this.state.constants.impulseEffectFactor, y: 0 },
                        this.spaceObject.angle
                    )
                );
            }
        }
    }

    private updateAntiDrift(deltaSeconds: number) {
        if (this.state.antiDrift) {
            const driftVelocity = XY.projection(
                this.spaceObject.velocity,
                XY.rotate(XY.one, this.spaceObject.angle - 90)
            );
            const diffLenfth = XY.lengthOf(driftVelocity);
            if (diffLenfth) {
                const enginePower = capToRange(
                    -this.state.maneuveringCapacity * deltaSeconds,
                    this.state.maneuveringCapacity * deltaSeconds,
                    diffLenfth * this.state.antiDrift
                );

                if (this.trySpendEnergy(enginePower * this.state.constants.maneuveringEnergyCost)) {
                    this.spaceManager.ChangeVelocity(
                        this.spaceObject.id,
                        XY.scale(
                            XY.negate(XY.normalize(driftVelocity)),
                            enginePower * this.state.constants.antiDriftEffectFactor
                        )
                    );
                }
            }
        }
    }

    private updateBreaks(deltaSeconds: number) {
        if (this.state.breaks && !XY.isZero(this.spaceObject.velocity)) {
            const velocityLength = XY.lengthOf(this.spaceObject.velocity);
            const enginePower = capToRange(
                -this.state.maneuveringCapacity * deltaSeconds,
                this.state.maneuveringCapacity * deltaSeconds,
                velocityLength * this.state.breaks
            );

            if (this.trySpendEnergy(enginePower * this.state.constants.maneuveringEnergyCost)) {
                this.spaceManager.ChangeVelocity(
                    this.spaceObject.id,
                    XY.scale(
                        XY.negate(XY.normalize(this.spaceObject.velocity)),
                        enginePower * this.state.constants.breaksEffectFactor
                    )
                );
            }
        }
    }

    private updateStrafe(deltaSeconds: number) {
        if (this.state.strafe) {
            const enginePower = capToRange(
                -this.state.maneuveringCapacity * deltaSeconds,
                this.state.maneuveringCapacity * deltaSeconds,
                this.state.strafe
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                this.spaceManager.ChangeVelocity(
                    this.spaceObject.id,
                    XY.scale(
                        XY.rotate(XY.one, this.spaceObject.angle + 90),
                        enginePower * this.state.constants.strafeEffectFactor
                    )
                );
            }
        }
    }

    private updateBoost(deltaSeconds: number) {
        if (this.state.boost) {
            const enginePower = capToRange(
                -this.state.maneuveringCapacity * deltaSeconds,
                this.state.maneuveringCapacity * deltaSeconds,
                this.state.boost
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                this.spaceManager.ChangeVelocity(
                    this.spaceObject.id,
                    XY.scale(
                        XY.rotate(XY.one, this.spaceObject.angle),
                        enginePower * this.state.constants.boostEffectFactor
                    )
                );
            }
        }
    }

    private updateTurnSpeed(deltaSeconds: number) {
        if (this.state.rotation) {
            const enginePower = this.state.rotation * this.state.maneuveringCapacity * deltaSeconds;
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                this.spaceManager.ChangeTurnSpeed(this.spaceObject.id, enginePower * this.state.rotationEffectFactor);
            }
        }
    }
}
