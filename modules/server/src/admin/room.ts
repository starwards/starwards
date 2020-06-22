import { AdminState } from '@starwards/model';
import { Client, matchMaker, Room } from 'colyseus';
import { ShipManager } from '../ship/ship-manager';
import { SpaceManager } from '../space/space-manager';
import { newShip, resetShip } from './map';
import { MapSchema } from '@colyseus/schema';

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

    public onCreate() {
        const state = new AdminState();
        state.points = new MapSchema();
        this.setState(state);
        this.onMessage('startGame', () => this.startGame());
        this.onMessage('stopGame', () => this.stopGame());
    }

    private async stopGame() {
        if (this.state.isGameRunning) {
            const shipRooms = await matchMaker.query({ name: 'ship' });
            for (const shipRoom of shipRooms) {
                await matchMaker.remoteRoomCall(shipRoom.roomId, 'disconnect', []);
            }
            const spaceRooms = await matchMaker.query({ name: 'space' });
            for (const spaceRoom of spaceRooms) {
                await matchMaker.remoteRoomCall(spaceRoom.roomId, 'disconnect', []);
            }
            this.state.isGameRunning = false;
        }
    }

    private async startGame() {
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            const spaceManager = new SpaceManager();
            this.addShip(spaceManager, 'A');
            this.addShip(spaceManager, 'B');
            await matchMaker.createRoom('space', { manager: spaceManager });
        }
    }

    private addShip(spaceManager: SpaceManager, id: string) {
        const ship = newShip(id);
        this.state.points[ship.id] = 0;
        const shipManager = new ShipManager(ship, spaceManager, () => {
            this.state.points[ship.id]++;
            resetShip(ship);
        }); // create a manager to manage the ship
        matchMaker.createRoom('ship', { manager: shipManager });
        spaceManager.insert(ship);
    }
}
