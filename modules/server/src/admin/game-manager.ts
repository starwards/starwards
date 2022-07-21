import {
    AdminState,
    ShipDie,
    ShipManager,
    SpaceManager,
    SpaceObject,
    Spaceship,
    makeShipState,
    resetShipState,
    shipConfigurations,
} from '@starwards/model';
import { GameApi, GameMap, ShipApi } from './scripts-api';
import { defaultMap, resetShip } from './map-helper';

import { ShipStateMessenger } from '../messaging/ship-state-messenger';
import { matchMaker } from 'colyseus';

type Die = {
    update: (deltaSeconds: number) => void;
};
export class GameManager {
    public state = new AdminState();
    private ships = new Map<string, ShipManager>();
    private dice: Die[] = [];
    private spaceManager = new SpaceManager();
    private map: GameMap | null = null;
    public readonly scriptApi: GameApi = {
        getShip: (shipId: string) => this.ships.get(shipId) as unknown as ShipApi,
        addObject: (obj: Exclude<SpaceObject, Spaceship>) => {
            const existing = this.spaceManager.state.get(obj.id);
            if (existing) {
                throw new Error(`existing object ${existing.type} with ID ${obj.id}`);
            }
            this.spaceManager.insert(obj);
        },
        addSpaceship: (ship: Spaceship) => this.initShip(ship) as unknown as ShipApi,
        stopGame: () => {
            this.state.shouldGameBeRunning = false;
        },
    };

    constructor(private shipMessenger?: ShipStateMessenger) {}

    async update(deltaSeconds: number) {
        this.shipMessenger?.update(deltaSeconds);
        this.map?.update?.(deltaSeconds);
        for (const die of this.dice) {
            die.update(deltaSeconds);
        }
        if (this.state.isGameRunning && !this.state.shouldGameBeRunning) {
            await this.stopGame();
        } else if (!this.state.isGameRunning && this.state.shouldGameBeRunning) {
            await this.startGame(defaultMap);
        }
    }

    public async stopGame() {
        this.state.shouldGameBeRunning = false;
        this.map = null;
        if (this.state.isGameRunning) {
            const shipRooms = await matchMaker.query({ name: 'ship' });
            for (const shipRoom of shipRooms) {
                await matchMaker.remoteRoomCall(shipRoom.roomId, 'disconnect', []);
            }
            const spaceRooms = await matchMaker.query({ name: 'space' });
            for (const spaceRoom of spaceRooms) {
                await matchMaker.remoteRoomCall(spaceRoom.roomId, 'disconnect', []);
            }
            this.dice = [];
            this.shipMessenger?.unRegisterAll();
            this.state.isGameRunning = false;
        }
    }

    public async startGame(map: GameMap) {
        this.state.shouldGameBeRunning = true;
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            this.map = map;
            this.spaceManager = new SpaceManager();
            map.init(this.scriptApi);
            this.spaceManager.forceFlushEntities();
            await matchMaker.createRoom('space', { manager: this.spaceManager });
        }
    }

    private initShip(spaceObject: Spaceship, sendMessages = false) {
        this.spaceManager.insert(spaceObject);
        const die = new ShipDie(3);
        if (!spaceObject.model) {
            throw new Error(`missing ship model for ship ${spaceObject.id}`);
        }
        const configuration = shipConfigurations[spaceObject.model];
        const shipManager = new ShipManager(
            spaceObject,
            makeShipState(spaceObject.id, configuration),
            this.spaceManager,
            die,
            this.ships,
            () => {
                resetShipState(shipManager.state);
                resetShip(spaceObject);
            }
        ); // create a manager to manage the ship
        this.ships.set(spaceObject.id, shipManager);
        this.dice.push(die);
        if (sendMessages) {
            this.shipMessenger?.registerShip(shipManager.state);
        }
        void matchMaker.createRoom('ship', { manager: shipManager });
        return shipManager;
    }
}
