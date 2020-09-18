import { ShipCommands, ShipManager, ShipState } from '@starwards/model';
import { Client, Room } from 'colyseus';

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

    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        this.setSimulationInterval((deltaMs) => manager.update(deltaMs / 1000));
        this.onMessage('setImpulse', (_, msg: ShipCommands['setImpulse']) => manager.setImpulse(msg.value));
        this.onMessage('setStrafe', (_, msg: ShipCommands['setStrafe']) => manager.setStrafe(msg.value));
        this.onMessage('setBoost', (_, msg: ShipCommands['setBoost']) => manager.setBoost(msg.value));
        this.onMessage('setRotation', (_, msg: ShipCommands['setRotation']) => manager.setRotation(msg.value));
        this.onMessage('setAntiDrift', (_, msg: ShipCommands['setAntiDrift']) => manager.setAntiDrift(msg.value));
        this.onMessage('setBreaks', (_, msg: ShipCommands['setBreaks']) => manager.setBreaks(msg.value));
        this.onMessage('setTarget', (_, msg: ShipCommands['setTarget']) => manager.setTarget(msg.id));
        this.onMessage('setConstant', (_, msg: ShipCommands['setConstant']) =>
            manager.setConstant(msg.name, msg.value)
        );
        this.onMessage('chainGun', (_, msg: ShipCommands['chainGun']) => manager.chainGun(msg.isFiring));
        this.onMessage('setChainGunConstant', (_, msg: ShipCommands['setChainGunConstant']) =>
            manager.setChainGunConstant(msg.name, msg.value)
        );
        this.onMessage('setShellSecondsToLive', (_, msg: ShipCommands['setShellSecondsToLive']) =>
            manager.setShellSecondsToLive(msg.value)
        );
    }
}
