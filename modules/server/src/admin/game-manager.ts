import { AdminState, ShipManager, SpaceManager } from '@starwards/model';
import { newAsteroid, newShip, resetShip } from './map';

import { MapSchema } from '@colyseus/schema';
import { MqttClient } from '../messaging/mqtt-client';
import { ShipStateMessenger } from '../messaging/ship-state-messenger';
import { matchMaker } from 'colyseus';

export class GameManager {
    public state = new AdminState();
    private ships = new Map<string, ShipManager>();
    private spaceManager = new SpaceManager();
    private mqttClient: MqttClient;
    private shipMessenger: ShipStateMessenger;

    constructor(mqttClient: MqttClient) {
        this.state.points = new MapSchema();
        this.mqttClient = mqttClient;
        this.shipMessenger = new ShipStateMessenger(this.mqttClient, 'ship-state');
    }

    update(_: number) {
        if (this.state.isGameRunning && !this.state.shouldGameBeRunning) {
            void this.stopGame();
        } else if (!this.state.isGameRunning && this.state.shouldGameBeRunning) {
            void this.startGame();
        }
    }

    public async stopGame() {
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

    public async startGame() {
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            this.spaceManager = new SpaceManager();
            this.addShip(this.spaceManager, 'A');
            const bManager = this.addShip(this.spaceManager, 'B');
            this.spaceManager.forceFlushEntities();
            // aManager.setTarget('B');
            // aManager.bot = jouster();
            bManager.setTarget('A');
            // bManager.bot = jouster();
            for (let i = 0; i < 20; i++) {
                this.spaceManager.insert(newAsteroid());
            }
            await matchMaker.createRoom('space', { manager: this.spaceManager });
        }
    }

    private addShip(spaceManager: SpaceManager, id: string, sendMessages = false) {
        const ship = newShip(id);
        this.state.points.set(ship.id, 0);
        const shipManager = new ShipManager(ship, spaceManager, this.ships, () => {
            this.state.points.set(ship.id, (this.state.points.get(ship.id) || 0) + 1);
            resetShip(ship);
        }); // create a manager to manage the ship
        this.ships.set(id, shipManager);
        if (sendMessages) {
            void this.shipMessenger.registerShip(id, shipManager.state);
        }
        void matchMaker.createRoom('ship', { manager: shipManager });
        spaceManager.insert(ship);
        return shipManager;
    }
}
