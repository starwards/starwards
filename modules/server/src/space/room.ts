import { SpaceCommands, SpaceState } from '@starwards/model';
import { Client, Room } from 'colyseus';
import { SpaceManager } from './space-manager';

export class SpaceRoom extends Room<SpaceState> {
    public static id = 'space';

    // For this example
    constructor() {
        super();
        this.autoDispose = false;
    }

    onDispose() {
        console.error('trying to dispose of SpaceRoom!');
        return new Promise(() => {}); // never surrender!
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
        this.onMessage('MoveObjects', (_, msg: SpaceCommands['MoveObjects']) =>
            manager.MoveObjects(msg.ids, msg.delta)
        );
    }
}
