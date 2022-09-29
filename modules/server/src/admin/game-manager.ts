import {
    AdminState,
    ShipDie,
    ShipManager,
    ShipState,
    SpaceManager,
    SpaceObject,
    Spaceship,
    makeShipState,
    shipConfigurations,
} from '@starwards/core';
import { GameApi, GameMap, ShipApi } from './scripts-api';

import { SavedGame } from '../serialization/game-state-protocol';
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
        addSpaceship: (ship: Spaceship) => this.addShip(ship) as unknown as ShipApi,
        stopGame: () => {
            void this.stopGame();
        },
    };

    update(deltaSeconds: number) {
        const adjustedDeltaSeconds = deltaSeconds * this.state.speed;
        if (this.state.isGameRunning && adjustedDeltaSeconds > 0) {
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
            this.state.shipIds.splice(0);
            const shipRooms = await matchMaker.query({ name: 'ship' });
            for (const shipRoom of shipRooms) {
                await matchMaker.remoteRoomCall(shipRoom.roomId, 'disconnect', []);
            }
            const spaceRooms = await matchMaker.query({ name: 'space' });
            for (const spaceRoom of spaceRooms) {
                await matchMaker.remoteRoomCall(spaceRoom.roomId, 'disconnect', []);
            }
            this.dice = [];
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
        if (!this.state.isGameRunning || !this.map) {
            return null;
        }
        const state = new SavedGame();
        state.mapName = this.map.name;
        this.spaceManager.forceFlushEntities();
        state.fragment.space = this.spaceManager.state;
        for (const [shipId, shipManager] of this.ships.entries()) {
            state.fragment.ship.set(shipId, shipManager.state);
        }
        return state.clone();
    }

    public async loadGame(source: SavedGame, map: GameMap) {
        if (this.state.isGameRunning) {
            await this.stopGame();
        }
        this.state.isGameRunning = true;
        this.map = map;
        this.spaceManager = new SpaceManager();
        this.spaceManager.insertBulk(source.fragment.space);
        await matchMaker.createRoom('space', { manager: this.spaceManager });
        for (const [id, shipState] of source.fragment.ship) {
            const so = source.fragment.space.getShip(id);
            if (so) {
                this.initShipRoom(so, shipState);
            }
        }
    }

    private addShip(spaceObject: Spaceship) {
        this.spaceManager.insert(spaceObject);
        if (!spaceObject.model) {
            throw new Error(`missing ship model for ship ${spaceObject.id}`);
        }
        const configuration = shipConfigurations[spaceObject.model];
        const shipState = makeShipState(spaceObject.id, configuration);
        const shipManager = this.initShipRoom(spaceObject, shipState);
        return shipManager;
    }

    private initShipRoom(spaceObject: Spaceship, shipState: ShipState) {
        const die = new ShipDie(3);
        const shipManager = new ShipManager(spaceObject, shipState, this.spaceManager, die, this.ships); // create a manager to manage the ship
        this.ships.set(spaceObject.id, shipManager);
        this.dice.push(die);
        void matchMaker.createRoom('ship', { manager: shipManager }).then(() => {
            this.state.shipIds.push(spaceObject.id);
        });
        return shipManager;
    }
}
