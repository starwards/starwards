import { Client, Room } from 'colyseus';
import { SpaceCommands, SpaceManager, SpaceState } from '@starwards/model';

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
        this.setSimulationInterval((deltaTime) => manager.update(deltaTime / 1000));
        this.onMessage('moveObjects', (_, msg: SpaceCommands['moveObjects']) =>
            manager.moveObjects(msg.ids, msg.delta)
        );
    }
}
