import { MapSchema } from '@colyseus/schema';
import { AdminState, ShipManager, SpaceManager } from '@starwards/model';
import { matchMaker } from 'colyseus';
import { terminator } from '../ship/bot';
import { newAsteroid, newShip, resetShip } from './map';

export class GameManager {
    public adminState = new AdminState();
    private ships = new Map<string, ShipManager>();
    private spaceManager = new SpaceManager();

    constructor() {
        this.adminState.points = new MapSchema();
    }

    public async stopGame() {
        if (this.adminState.isGameRunning) {
            const shipRooms = await matchMaker.query({ name: 'ship' });
            for (const shipRoom of shipRooms) {
                await matchMaker.remoteRoomCall(shipRoom.roomId, 'disconnect', []);
            }
            const spaceRooms = await matchMaker.query({ name: 'space' });
            for (const spaceRoom of spaceRooms) {
                await matchMaker.remoteRoomCall(spaceRoom.roomId, 'disconnect', []);
            }
            this.adminState.isGameRunning = false;
        }
    }

    public async startGame() {
        if (!this.adminState.isGameRunning) {
            this.adminState.isGameRunning = true;
            this.spaceManager = new SpaceManager();
            this.addShip(this.spaceManager, 'A');
            this.addShip(this.spaceManager, 'B');
            this.spaceManager.forceFlushEntities();
            const aManager = this.ships.get('A');
            if (aManager) {
                aManager.setTarget('B');
                aManager.bot = terminator();
            }
            const bManager = this.ships.get('B');
            if (bManager) {
                bManager.setTarget('A');
                bManager.bot = terminator();
            }
            for (let i = 0; i < 1; i++) {
                this.spaceManager.insert(newAsteroid());
            }
            await matchMaker.createRoom('space', { manager: this.spaceManager });
        }
    }

    private addShip(spaceManager: SpaceManager, id: string) {
        const ship = newShip(id);
        this.adminState.points[ship.id] = 0;
        const shipManager = new ShipManager(ship, spaceManager, this.ships, () => {
            this.adminState.points[ship.id]++;
            resetShip(ship);
        }); // create a manager to manage the ship
        this.ships.set(id, shipManager);
        void matchMaker.createRoom('ship', { manager: shipManager });
        spaceManager.insert(ship);
    }
}
