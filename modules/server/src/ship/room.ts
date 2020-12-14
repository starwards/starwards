import { Client, Room } from 'colyseus';
import {
    ShipCommands,
    ShipManager,
    ShipState,
    StatePropertyValue,
    cmdReceiver,
    isStatePropertyCommand,
    shipProperties as sp,
} from '@starwards/model';

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
        for (const prop of Object.values(sp)) {
            if (isStatePropertyCommand<unknown, 'ship'>(prop)) {
                const c = cmdReceiver<StatePropertyValue<typeof prop>>(manager, prop);
                this.onMessage(prop.cmdName, c);
            }
        }
        this.onMessage('setShellSecondsToLive', (_, msg: ShipCommands['setShellSecondsToLive']) =>
            manager.setShellSecondsToLive(msg.value)
        );
    }
}
