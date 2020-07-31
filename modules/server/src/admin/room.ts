import { AdminState } from '@starwards/model';
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
        // tslint:disable-next-line: no-console
        console.error(`trying to dispose of AdminRoom`);
        return new Promise(() => 0); // never surrender!
    }

    public onCreate({ manager }: { manager: GameManager }) {
        this.setState(manager.adminState);
        this.onMessage('startGame', () => manager.startGame());
        this.onMessage('stopGame', () => manager.stopGame());
    }
}
