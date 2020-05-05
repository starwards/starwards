import { ShipCommands, ShipState, Spaceship, XY } from '@starwards/model';
import { Client, Room } from 'colyseus';
import { SpaceManager } from '../space/space-manager';

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
        console.error(`trying to dispose of ShipRoom ${this.roomId}`);
        return new Promise(() => {}); // never surrender!
    }
    public onCreate({ object, manager }: { object: Spaceship; manager: SpaceManager }) {
        this.roomId = object.id;
        this.setState(new ShipState(false));
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
    }

    update(deltaTime: number, object: Spaceship, manager: SpaceManager) {
        // sync relevant ship props
        this.syncShipProperties(object);

        const energyPerSecond = 0.5;
        const maxEnergy = 1000;
        this.state.energy = capToRange(0, maxEnergy, this.state.energy + energyPerSecond * deltaTime);
        const rotationEnergyCost = 0.01;
        const maxRotationDeltaPerSecond = 75;
        const turnSpeedDiff = this.state.targetTurnSpeed - object.turnSpeed;
        if (turnSpeedDiff) {
            const enginePower = capToRange(
                -maxRotationDeltaPerSecond * deltaTime,
                maxRotationDeltaPerSecond * deltaTime,
                turnSpeedDiff
            );
            if (this.trySpendEnergy(Math.abs(enginePower) * rotationEnergyCost)) {
                manager.ChangeTurnSpeed(object.id, enginePower);
            }
        }
        const stabilizerEnergyCost = 0.07;
        if (this.state.stabilizer) {
            const nonDriftVelocity = XY.projection(object.velocity, XY.rotate(XY.one, object.angle));
            const velocityDiff = XY.scale(XY.difference(nonDriftVelocity, this.state.velocity), this.state.stabilizer);
            const diffLenfth = XY.lengthOf(velocityDiff);
            if (diffLenfth) {
                const enginePower = capToRange(
                    -maxRotationDeltaPerSecond * deltaTime,
                    maxRotationDeltaPerSecond * deltaTime,
                    diffLenfth
                );

                if (this.trySpendEnergy(enginePower * stabilizerEnergyCost)) {
                    manager.ChangeVelocity(object.id, XY.scale(velocityDiff, enginePower / diffLenfth));
                }
            }
        }

        const impulseEnergyCost = 5;
        if (this.state.impulse) {
            if (this.trySpendEnergy(Math.abs(this.state.impulse) * deltaTime * impulseEnergyCost)) {
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
