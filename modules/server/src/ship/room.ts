import { ShipState, ShipCommands } from '@starwards/model';
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

    public onCreate({ id, manager }: { id: string; manager: SpaceManager }) {
        this.roomId = id;
        this.setState(new ShipState(id));
        this.onMessage('ChangeTurnSpeed', (_, msg: ShipCommands['ChangeTurnSpeed']) =>
            manager.ChangeTurnSpeed(id, msg.delta)
        );
        this.onMessage('SetTurnSpeed', (_, msg: ShipCommands['SetTurnSpeed']) => manager.SetTurnSpeed(id, msg.value));
        this.onMessage('ChangeVelocity', (_, msg: ShipCommands['ChangeVelocity']) =>
            manager.ChangeVelocity(id, msg.delta)
        );
        this.onMessage('SetVelocity', (_, msg: ShipCommands['SetVelocity']) => manager.SetVelocity(id, msg.value));
    }
}
