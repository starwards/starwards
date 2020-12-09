import { Client, Room } from 'colyseus';

import { AdminState } from '@starwards/model';
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
        this.setState(manager.adminState);
        this.onMessage('startGame', () => {
            void manager.startGame();
        });
        this.onMessage('stopGame', () => {
            void manager.stopGame();
        });
    }
}
