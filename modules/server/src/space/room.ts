import { Client, Room } from 'colyseus';
import { SpaceManager, SpaceState, cmdReceivers, spaceProperties } from '@starwards/model';

export class SpaceRoom extends Room<SpaceState> {
    public static id = 'space';

    constructor() {
        super();
        this.autoDispose = false;
    }

    public async onLeave(client: Client, consented: boolean) {
        if (!consented) {
            await this.allowReconnection(client, 30);
        }
    }

    public onCreate({ manager }: { manager: SpaceManager }) {
        this.roomId = SpaceRoom.id;
        this.setState(manager.state);
        for (const [cmdName, handler] of cmdReceivers(spaceProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
    }
}
