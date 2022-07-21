import { AdminState, adminProperties, cmdReceivers } from '@starwards/model';
import { Client, Room } from 'colyseus';

import { GameManager } from './game-manager';

export class AdminRoom extends Room<AdminState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public async onLeave(client: Client, consented: boolean) {
        if (!consented) {
            await this.allowReconnection(client, 30);
        }
    }

    public onCreate({ manager }: { manager: GameManager }) {
        this.setState(manager.state);
        this.setSimulationInterval((deltaMs) => void manager.update(deltaMs / 1000));
        for (const [cmdName, handler] of cmdReceivers(adminProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
    }
}
