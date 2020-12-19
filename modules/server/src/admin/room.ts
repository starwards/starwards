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

    onDispose() {
        // eslint-disable-next-line no-console
        console.error(`trying to dispose of AdminRoom`);
        return new Promise(() => 0); // never surrender!
    }

    public onCreate({ manager }: { manager: GameManager }) {
        this.setState(manager.state);
        this.setSimulationInterval((deltaMs) => manager.update(deltaMs / 1000));
        for (const [cmdName, handler] of cmdReceivers(adminProperties, manager)) {
            this.onMessage(cmdName, handler);
        }
    }
}
