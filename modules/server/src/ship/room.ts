import { Client, Room } from 'colyseus';
import { ShipCommands, ShipManager, ShipState, SmartPilotCommands } from '@starwards/model';

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
        this.onMessage('setAntiDrift', (_, msg: ShipCommands['setAntiDrift']) => manager.setAntiDrift(msg.value));
        this.onMessage('setBreaks', (_, msg: ShipCommands['setBreaks']) => manager.setBreaks(msg.value));
        this.onMessage('setTarget', (_, msg: ShipCommands['setTarget']) => manager.setTarget(msg.id));
        this.onMessage('nextTarget', () => manager.nextTarget());
        this.onMessage('setConstant', (_, msg: ShipCommands['setConstant']) =>
            manager.setConstant(msg.name, msg.value)
        );
        this.onMessage('chainGun', (_, msg: ShipCommands['chainGun']) => manager.chainGun(msg.isFiring));
        this.onMessage('setShellSecondsToLive', (_, msg: ShipCommands['setShellSecondsToLive']) =>
            manager.setShellSecondsToLive(msg.value)
        );
        this.onMessage('setChainGunConstant', (_, msg: ShipCommands['setChainGunConstant']) =>
            manager.setChainGunConstant(msg.name, msg.value)
        );
        this.onMessage('toggleSmartPilotManeuveringMode', () => manager.toggleSmartPilotManeuveringMode());
        this.onMessage('toggleSmartPilotRotationMode', () => manager.toggleSmartPilotRotationMode());

        this.onMessage('setCombatManeuvers', (_, msg: ShipCommands['setCombatManeuvers']) =>
            manager.setCombatManeuvers(msg.value)
        );
        this.onMessage('setSmartPilotRotation', (_, msg: SmartPilotCommands['setSmartPilotRotation']) =>
            manager.setSmartPilotRotation(msg.value)
        );
        this.onMessage('setSmartPilotBoost', (_, msg: SmartPilotCommands['setSmartPilotBoost']) =>
            manager.setSmartPilotBoost(msg.value)
        );
        this.onMessage('setSmartPilotStrafe', (_, msg: SmartPilotCommands['setSmartPilotStrafe']) =>
            manager.setSmartPilotStrafe(msg.value)
        );
    }
}
