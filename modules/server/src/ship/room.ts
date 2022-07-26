import { Client, Room } from 'colyseus';
import { ShipManager, ShipState, cmdReceivers, shipProperties } from '@starwards/model';

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
        for (const [cmdName, handler] of cmdReceivers(shipProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
    }
}
