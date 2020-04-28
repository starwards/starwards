import { ShipState, ShipCommands, Spaceship } from '@starwards/model';
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

    public onCreate({ object, manager }: { object: Spaceship; manager: SpaceManager }) {
        this.roomId = object.id;
        this.setState(new ShipState(false));
        this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000, object, manager));
        this.onMessage('ChangeTurnSpeed', (_, msg: ShipCommands['ChangeTurnSpeed']) =>
            manager.ChangeTurnSpeed(this.roomId, msg.delta)
        );
        this.onMessage('SetTurnSpeed', (_, msg: ShipCommands['SetTurnSpeed']) =>
            manager.SetTurnSpeed(this.roomId, msg.value)
        );
        this.onMessage('ChangeVelocity', (_, msg: ShipCommands['ChangeVelocity']) =>
            manager.ChangeVelocity(this.roomId, msg.delta)
        );
        this.onMessage('SetVelocity', (_, msg: ShipCommands['SetVelocity']) =>
            manager.SetVelocity(this.roomId, msg.value)
        );
        // this.onMessage('SetImpulse', (_, msg: ShipCommands['SetImpulse']) => (this.state.impulse = msg.value));
        // this.onMessage('SetRotation', (_, msg: ShipCommands['SetRotation']) => (this.state.rotation = msg.value));
        this.onMessage(
            'SetTargetTurnSpeed',
            (_, msg: ShipCommands['SetTargetTurnSpeed']) => (this.state.targetTurnSpeed = msg.value)
        );
    }

    update(deltaTime: number, object: Spaceship, manager: SpaceManager) {
        const energyPerSecond = 0.5;
        const maxEnergy = 1000;
        this.state.energy = capToRange(0, maxEnergy, this.state.energy + energyPerSecond * deltaTime);
        // if (this.state.impulse !== 0) {
        //     const delta = Vec2.Rotate({ x: this.state.impulse * deltaTime, y: 0 }, object.angle);
        //     manager.ChangeVelocity(this.roomId, delta);
        // }
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
                manager.ChangeTurnSpeed(this.roomId, enginePower);
            }
        }
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
