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
        state.constants.rotationEnergyCost = 0.01;
        state.constants.maxRotationDeltaPerSecond = 75;
        state.constants.stabilizerEnergyCost = 0.07;
        state.constants.impulseEnergyCost = 5;
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
        // this.onMessage('SetRotation', (_, msg: ShipCommands['SetRotation']) => (this.state.rotation = msg.value));
        this.onMessage('SetTargetTurnSpeed', (_, msg: ShipCommands['SetTargetTurnSpeed']) => {
            this.state.targetTurnSpeed = msg.value;
        });
        this.onMessage('SetStabilizer', (_, msg: ShipCommands['SetStabilizer']) => (this.state.stabilizer = msg.value));
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
                -this.state.constants.maxRotationDeltaPerSecond * deltaTime,
                this.state.constants.maxRotationDeltaPerSecond * deltaTime,
                turnSpeedDiff
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.constants.rotationEnergyCost)) {
                manager.ChangeTurnSpeed(object.id, enginePower);
            }
        }
        if (this.state.stabilizer) {
            const nonDriftVelocity = XY.projection(object.velocity, XY.rotate(XY.one, object.angle));
            const velocityDiff = XY.scale(XY.difference(nonDriftVelocity, this.state.velocity), this.state.stabilizer);
            const diffLenfth = XY.lengthOf(velocityDiff);
            if (diffLenfth) {
                const enginePower = capToRange(
                    -this.state.constants.maxRotationDeltaPerSecond * deltaTime,
                    this.state.constants.maxRotationDeltaPerSecond * deltaTime,
                    diffLenfth
                );

                if (this.trySpendEnergy(enginePower * this.state.constants.stabilizerEnergyCost)) {
                    manager.ChangeVelocity(object.id, XY.scale(velocityDiff, enginePower / diffLenfth));
                }
            }
        }

        if (this.state.impulse) {
            if (
                this.trySpendEnergy(Math.abs(this.state.impulse) * deltaTime * this.state.constants.impulseEnergyCost)
            ) {
                manager.ChangeVelocity(object.id, XY.rotate({ x: this.state.impulse * deltaTime, y: 0 }, object.angle));
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
