import { ShipCommands, ShipState } from '@starwards/model';
import { Client, Room } from 'colyseus';
import { ShipManager } from './ship-manager';

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
        console.error(`disposing ShipRoom ${this.roomId}`);
    }

    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        this.setSimulationInterval((deltaMs) => manager.update(deltaMs / 1000));
        this.onMessage('setImpulse', (_, msg: ShipCommands['setImpulse']) => manager.setImpulse(msg.value));
        this.onMessage('setStrafe', (_, msg: ShipCommands['setStrafe']) => manager.setStrafe(msg.value));
        this.onMessage('setBoost', (_, msg: ShipCommands['setBoost']) => manager.setBoost(msg.value));
        this.onMessage('setTargetTurnSpeed', (_, msg: ShipCommands['setTargetTurnSpeed']) =>
            manager.setTargetTurnSpeed(msg.value)
        );
        this.onMessage('setAntiDrift', (_, msg: ShipCommands['setAntiDrift']) => manager.setAntiDrift(msg.value));
        this.onMessage('setBreaks', (_, msg: ShipCommands['setBreaks']) => manager.setBreaks(msg.value));
        this.onMessage('setConstant', (_, msg: ShipCommands['setConstant']) =>
            manager.setConstant(msg.name, msg.value)
        );
        this.onMessage('autoCannon', (_, msg: ShipCommands['autoCannon']) => manager.autoCannon(msg.isFiring));
    }
}
