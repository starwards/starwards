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

import { GameStateFragment } from './game-state-fragment';
import { ShipStateMessenger } from '../messaging/ship-state-messenger';
import { matchMaker } from 'colyseus';
import { resetShip } from './map-helper';

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
            void this.stopGame();
        },
    };

    constructor(private shipMessenger?: ShipStateMessenger) {}

    update(deltaSeconds: number) {
        const adjustedDeltaSeconds = deltaSeconds * this.state.speed;
        if (this.state.isGameRunning && adjustedDeltaSeconds > 0) {
            this.shipMessenger?.update(adjustedDeltaSeconds);
            this.map?.update?.(adjustedDeltaSeconds);
            for (const die of this.dice) {
                die.update(adjustedDeltaSeconds);
            }
            for (const shipManager of this.ships.values()) {
                shipManager.update(adjustedDeltaSeconds);
            }
            this.spaceManager.update(adjustedDeltaSeconds);
        }
    }

    public async stopGame() {
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
        if (!this.state.isGameRunning) {
            this.state.isGameRunning = true;
            this.map = map;
            this.ships = new Map<string, ShipManager>();
            this.spaceManager = new SpaceManager();
            map.init(this.scriptApi);
            this.spaceManager.forceFlushEntities();
            await matchMaker.createRoom('space', { manager: this.spaceManager });
        }
    }

    public saveGame() {
        if (!this.state.isGameRunning) {
            return null;
        }
        const state = new GameStateFragment();
        state.space = this.spaceManager.state;
        for (const [shipId, shipManager] of this.ships.entries()) {
            state.ship.set(shipId, shipManager.state);
        }
        return state; // this is risky - it should only be used for serialization
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
