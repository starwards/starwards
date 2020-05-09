import { AdminState, Spaceship } from '@starwards/model';
import { Client, matchMaker, Room } from 'colyseus';
import { SpaceManager } from '../space/space-manager';
import { map } from './map';

export class AdminRoom extends Room<AdminState> {
    private manager = new SpaceManager();
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

    public onCreate() {
        this.setState(new AdminState());
        this.onMessage('StartGame', () => this.startGame());
    }

    private async startGame() {
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            this.manager = new SpaceManager();
            map.forEach((o) => {
                o = o.clone();
                if (Spaceship.isInstance(o)) {
                    matchMaker.createRoom('ship', { object: o, manager: this.manager }); // create a room to control this ship
                }
                this.manager.insert(o);
            });
            await matchMaker.createRoom('space', { manager: this.manager });
        }
    }
}
