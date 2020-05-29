import { AdminState, Spaceship } from '@starwards/model';
import { Client, matchMaker, Room } from 'colyseus';
import { SpaceManager } from '../space/space-manager';
import { map } from './map';
import { ShipManager } from '../ship/ship-manager';

export class AdminRoom extends Room<AdminState> {
    private manager = new SpaceManager();
    private shipManagers = new Map<string, ShipManager>();
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
        this.onMessage('startGame', () => this.startGame());
    }

    private async startGame() {
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            this.manager = new SpaceManager();
            map.forEach((o) => {
                o = o.clone();
                if (Spaceship.isInstance(o)) {
                    const shipManager = new ShipManager(o, this.manager); // create a manager to manage the ship
                    this.shipManagers.set(o.id, shipManager);
                    matchMaker.createRoom('ship', { manager: shipManager }); // create a room to control this ship
                }
                this.manager.insert(o);
            });
            await matchMaker.createRoom('space', { manager: this.manager });
        }
    }
}
