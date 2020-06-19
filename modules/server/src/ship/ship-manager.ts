import { MapSchema } from '@colyseus/schema';
import { ShipState, Spaceship, XY, AutoCannon, Missile, Vec2 } from '@starwards/model';
import { SpaceManager } from '../space/space-manager';
import { makeId } from '../admin/id';

function capToRange(from: number, to: number, value: number) {
    return value > to ? to : value < from ? from : value;
}

export class ShipManager {
    public state = new ShipState(false); // this state tree should only be exposed by the ship room

    constructor(public spaceObject: Spaceship, private spaceManager: SpaceManager, private onDestroy: () => void) {
        this.state.constants = new MapSchema<number>();
        this.state.constants.energyPerSecond = 0.5;
        this.state.constants.maxEnergy = 1000;
        this.state.constants.maneuveringCapacity = 75;
        this.state.constants.maneuveringEnergyCost = 0.07;
        this.state.constants.antiDriftEffectFactor = 0.3;
        this.state.constants.rotationEffectFactor = 0.75;
        this.state.constants.strafeEffectFactor = 0.3;
        this.state.constants.boostEffectFactor = 0.3;
        this.state.constants.impulseEnergyCost = 5;
        this.state.constants.impulseCapacity = 75;
        this.state.constants.impulseEffectFactor = 4;
        this.state.autoCannon = new AutoCannon();
        this.state.autoCannon.constants = new MapSchema<number>();
        this.state.autoCannon.constants.bulletsPerSecond = 7;
        this.state.autoCannon.constants.bulletSpeed = 150;
        this.state.autoCannon.constants.bulletRandomDegrees = 4;
    }

    public setImpulse(value: number) {
        this.state.impulse = value;
    }

    public setStrafe(value: number) {
        this.state.strafe = value;
    }

    public setBoost(value: number) {
        this.state.boost = value;
    }

    public setTargetTurnSpeed(value: number) {
        this.state.targetTurnSpeed = value;
    }

    public setAntiDrift(value: number) {
        this.state.antiDrift = value;
    }

    public setConstant(name: string, value: number) {
        this.state.constants[name] = value;
    }

    public autoCannon(isFiring: boolean) {
        this.state.autoCannon.isFiring = isFiring;
    }

    update(deltaSeconds: number) {
        if (this.spaceObject.health <= 0) {
            this.onDestroy();
        } else {
            // sync relevant ship props
            this.syncShipProperties();
            this.updateEnergy(deltaSeconds);
            this.updateTurnSpeed(deltaSeconds);
            this.updateBoost(deltaSeconds);
            this.updateStrafe(deltaSeconds);
            this.updateAntiDrift(deltaSeconds);
            this.updateImpulse(deltaSeconds);
            this.updateAutocannon(deltaSeconds);
            this.fireAutocannon();
        }
    }

    private syncShipProperties() {
        // only sync data that should be exposed to room clients
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
        this.state.turnSpeed = this.spaceObject.turnSpeed;
        this.state.angle = this.spaceObject.angle;
    }

    trySpendEnergy(value: number): boolean {
        if (value < 0) {
            // tslint:disable-next-line: no-console
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

    private updateAutocannon(deltaSeconds: number) {
        const autocannon = this.state.autoCannon;
        if (autocannon.cooldown > 0) {
            // charge weapon
            autocannon.cooldown -= deltaSeconds * autocannon.constants.bulletsPerSecond;
            if (!autocannon.isFiring && autocannon.cooldown < 0) {
                autocannon.cooldown = 0;
            }
        }
    }

    private fireAutocannon() {
        const autocannon = this.state.autoCannon;
        if (autocannon.isFiring && autocannon.cooldown <= 0) {
            autocannon.cooldown += 1;
            const missile = new Missile();

            missile.angle = this.spaceObject.angle + autocannon.angle;
            missile.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate(
                    { x: autocannon.constants.bulletSpeed, y: 0 },
                    missile.angle + (Math.random() - 0.5) * autocannon.constants.bulletRandomDegrees
                )
            );
            const missilePosition = Vec2.sum(
                this.spaceObject.position,
                XY.rotate({ x: this.spaceObject.radius + missile.radius, y: 0 }, missile.angle)
            );
            missile.init(makeId(), missilePosition);
            missile.secondsToLive = 10;
            this.spaceManager.insert(missile);
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
                    -this.state.constants.maneuveringCapacity * deltaSeconds,
                    this.state.constants.maneuveringCapacity * deltaSeconds,
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

    private updateStrafe(deltaSeconds: number) {
        if (this.state.strafe) {
            const enginePower = capToRange(
                -this.state.constants.maneuveringCapacity * deltaSeconds,
                this.state.constants.maneuveringCapacity * deltaSeconds,
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
                -this.state.constants.maneuveringCapacity * deltaSeconds,
                this.state.constants.maneuveringCapacity * deltaSeconds,
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
        const turnSpeedDiff = this.state.targetTurnSpeed - this.spaceObject.turnSpeed;
        if (turnSpeedDiff) {
            const enginePower = capToRange(
                -this.state.constants.maneuveringCapacity * deltaSeconds,
                this.state.constants.maneuveringCapacity * deltaSeconds,
                turnSpeedDiff
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                this.spaceManager.ChangeTurnSpeed(
                    this.spaceObject.id,
                    enginePower * this.state.constants.rotationEffectFactor
                );
            }
        }
    }
}
