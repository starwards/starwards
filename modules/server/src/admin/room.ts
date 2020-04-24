import { AdminCommand, AdminState } from '@starwards/model';
import { Client, matchMaker, Room } from 'colyseus';

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

    public onCreate() {
        this.setState(new AdminState());
        this.onMessage('StartGame', async (_client: Client, _message: AdminCommand) => {
            await matchMaker.createRoom('space', {}); // create a game
        });
    }
}
