import { AdminState, StatePropertyValue, adminProperties, cmdReceiver, isStateCommand } from '@starwards/model';
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
        for (const prop of Object.values(adminProperties)) {
            if (isStateCommand<unknown, 'admin'>(prop)) {
                const c = cmdReceiver<StatePropertyValue<typeof prop>, 'admin'>(manager, prop);
                this.onMessage(prop.cmdName, c);
            }
        }
    }
}
