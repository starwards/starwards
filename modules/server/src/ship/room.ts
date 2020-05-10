import { ShipCommands, ShipState, Spaceship, XY } from '@starwards/model';
import { Client, Room } from 'colyseus';
import { SpaceManager } from '../space/space-manager';
import { MapSchema } from '@colyseus/schema';

export class ShipRoom extends Room<ShipState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public async onLeave(client: Client, consented: boolean) {
        if (!consented) {
            await this.allowReconnection(client, 30);
        }
    }

    onDispose() {
        // tslint:disable-next-line: no-console
        console.error(`trying to dispose of ShipRoom ${this.roomId}`);
        return new Promise(() => 0); // never surrender!
    }
    private setInitialState() {
        const state = new ShipState(false);
        state.constants = new MapSchema<number>();
        state.constants.energyPerSecond = 0.5;
        state.constants.maxEnergy = 1000;
        state.constants.maneuveringCapacity = 75;
        state.constants.maneuveringEnergyCost = 0.07;
        state.constants.antiDriftEffectFactor = 0.3;
        state.constants.rotationEffectFactor = 0.75;
        state.constants.strafeEffectFactor = 0.3;
        state.constants.boostEffectFactor = 0.3;
        state.constants.impulseEnergyCost = 5;
        state.constants.impulseCapacity = 75;
        state.constants.impulseEffectFactor = 4;
        this.setState(state);
    }
    public onCreate({ object, manager }: { object: Spaceship; manager: SpaceManager }) {
        this.roomId = object.id;
        this.setInitialState();
        this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000, object, manager));
        this.onMessage('ChangeTurnSpeed', (_, msg: ShipCommands['ChangeTurnSpeed']) =>
            manager.ChangeTurnSpeed(object.id, msg.delta)
        );
        this.onMessage('SetTurnSpeed', (_, msg: ShipCommands['SetTurnSpeed']) =>
            manager.SetTurnSpeed(object.id, msg.value)
        );
        this.onMessage('ChangeVelocity', (_, msg: ShipCommands['ChangeVelocity']) =>
            manager.ChangeVelocity(object.id, msg.delta)
        );
        this.onMessage('SetVelocity', (_, msg: ShipCommands['SetVelocity']) =>
            manager.SetVelocity(object.id, msg.value)
        );
        this.onMessage('SetImpulse', (_, msg: ShipCommands['SetImpulse']) => (this.state.impulse = msg.value));
        this.onMessage('SetStrafe', (_, msg: ShipCommands['SetStrafe']) => (this.state.strafe = msg.value));
        this.onMessage('SetBoost', (_, msg: ShipCommands['SetBoost']) => (this.state.boost = msg.value));
        this.onMessage('SetTargetTurnSpeed', (_, msg: ShipCommands['SetTargetTurnSpeed']) => {
            this.state.targetTurnSpeed = msg.value;
        });
        this.onMessage('SetAntiDrift', (_, msg: ShipCommands['SetAntiDrift']) => (this.state.antiDrift = msg.value));
        this.onMessage(
            'SetConstant',
            (_, msg: ShipCommands['SetConstant']) => (this.state.constants[msg.name] = msg.value)
        );
    }

    update(deltaTime: number, object: Spaceship, manager: SpaceManager) {
        // sync relevant ship props
        this.syncShipProperties(object);

        this.state.energy = capToRange(
            0,
            this.state.constants.maxEnergy,
            this.state.energy + this.state.constants.energyPerSecond * deltaTime
        );
        const turnSpeedDiff = this.state.targetTurnSpeed - object.turnSpeed;
        if (turnSpeedDiff) {
            const enginePower = capToRange(
                -this.state.constants.maneuveringCapacity * deltaTime,
                this.state.constants.maneuveringCapacity * deltaTime,
                turnSpeedDiff
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                manager.ChangeTurnSpeed(object.id, enginePower * this.state.constants.rotationEffectFactor);
            }
        }
        if (this.state.boost) {
            const enginePower = capToRange(
                -this.state.constants.maneuveringCapacity * deltaTime,
                this.state.constants.maneuveringCapacity * deltaTime,
                this.state.boost
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                manager.ChangeVelocity(
                    object.id,
                    XY.scale(XY.rotate(XY.one, object.angle), enginePower * this.state.constants.boostEffectFactor)
                );
            }
        }
        if (this.state.strafe) {
            const enginePower = capToRange(
                -this.state.constants.maneuveringCapacity * deltaTime,
                this.state.constants.maneuveringCapacity * deltaTime,
                this.state.strafe
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.maneuveringEnergyCost)) {
                manager.ChangeVelocity(
                    object.id,
                    XY.scale(
                        XY.rotate(XY.one, object.angle + 90),
                        enginePower * this.state.constants.strafeEffectFactor
                    )
                );
            }
        }
        if (this.state.antiDrift) {
            const driftVelocity = XY.projection(object.velocity, XY.rotate(XY.one, object.angle - 90));
            const diffLenfth = XY.lengthOf(driftVelocity);
            if (diffLenfth) {
                const enginePower = capToRange(
                    -this.state.constants.maneuveringCapacity * deltaTime,
                    this.state.constants.maneuveringCapacity * deltaTime,
                    diffLenfth * this.state.antiDrift
                );

                if (this.trySpendEnergy(enginePower * this.state.constants.maneuveringEnergyCost)) {
                    manager.ChangeVelocity(
                        object.id,
                        XY.scale(
                            XY.negate(XY.normalize(driftVelocity)),
                            enginePower * this.state.constants.antiDriftEffectFactor
                        )
                    );
                }
            }
        }

        if (this.state.impulse) {
            if (
                this.trySpendEnergy(Math.abs(this.state.impulse) * deltaTime * this.state.constants.impulseEnergyCost)
            ) {
                manager.ChangeVelocity(
                    object.id,
                    XY.rotate(
                        { x: this.state.impulse * deltaTime * this.state.constants.impulseEffectFactor, y: 0 },
                        object.angle
                    )
                );
            }
        }
    }

    private syncShipProperties(object: Spaceship) {
        this.state.velocity.x = object.velocity.x;
        this.state.velocity.y = object.velocity.y;
        this.state.turnSpeed = object.turnSpeed;
        this.state.angle = object.angle;
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
}

function capToRange(from: number, to: number, value: number) {
    return value > to ? to : value < from ? from : value;
}
