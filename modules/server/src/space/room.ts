import { SpaceCommands, SpaceState, SpaceManager } from '@starwards/model';
import { Client, Room } from 'colyseus';

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
        this.setSimulationInterval((deltaTime) => manager.update(deltaTime));
        this.onMessage('moveObjects', (_, msg: SpaceCommands['moveObjects']) =>
            manager.moveObjects(msg.ids, msg.delta)
        );
    }
}
