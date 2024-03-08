import {
    AdminState,
    GameApi,
    GameMap,
    GameStatus,
    ShipApi,
    ShipDie,
    ShipManagerNpc,
    ShipManagerPc,
    ShipState,
    SpaceManager,
    SpaceObject,
    Spaceship,
    Vec2,
    makeId,
    makeShipState,
    shipConfigurations,
} from '@starwards/core';
import { IRoomListingData, matchMaker } from 'colyseus';

import { SavedGame } from '../serialization/game-state-protocol';
import { Updateable } from 'modules/core/src/updateable';

type ShipManager = ShipManagerPc | ShipManagerNpc;
export class GameManager {
    public state = new AdminState();
    private shipCleanups = new Map<string, () => unknown>();
    private shipManagers = new Map<string, ShipManager>();
    private dice: Updateable[] = [];
    private spaceManager = new SpaceManager();
    private map: GameMap | null = null;
    private deltaSecondsAvg = 1 / 20;
    private totalSeconds = 0;
    public readonly scriptApi: GameApi = {
        getShip: (shipId: string) => this.shipManagers.get(shipId) as ShipApi | undefined,
        addObject: (obj: Exclude<SpaceObject, Spaceship>) => {
            const existing = this.spaceManager.state.get(obj.id);
            if (existing) {
                throw new Error(`existing object ${existing.type} with ID ${obj.id}`);
            }
            this.spaceManager.insert(obj);
        },
        addPlayerSpaceship: (ship: Spaceship) => this.addShip(ship, true),
        addNpcSpaceship: (ship: Spaceship) => this.addShip(ship, false),
        stopGame: () => {
            void this.stopGame();
        },
    };

    update(currDeltaSeconds: number) {
        this.deltaSecondsAvg = this.deltaSecondsAvg * 0.8 + currDeltaSeconds * 0.2;
        const adjustedDeltaSeconds = currDeltaSeconds * this.state.speed;
        this.totalSeconds = this.totalSeconds + adjustedDeltaSeconds;
        if (this.state.isGameRunning && adjustedDeltaSeconds > 0) {
            const iterationData = {
                deltaSeconds: currDeltaSeconds * this.state.speed,
                deltaSecondsAvg: this.deltaSecondsAvg * this.state.speed,
                totalSeconds: this.totalSeconds,
            };
            this.map?.update?.(adjustedDeltaSeconds);
            for (const die of this.dice) {
                die.update(iterationData);
            }
            for (const shipManager of this.shipManagers.values()) {
                shipManager.update(iterationData);
            }
            this.spaceManager.update(iterationData);
            for (const id of this.spaceManager.state.destroySpaceshipCommands) {
                this.cleanupShip(id);
            }
            this.spaceManager.state.destroySpaceshipCommands = [];
            for (const cmd of this.spaceManager.state.createSpaceshipCommands) {
                const ship = new Spaceship().init(makeId(), Vec2.make(cmd.position), cmd.shipModel, cmd.faction);
                this.addShip(ship, cmd.isPlayerShip);
            }
            this.spaceManager.state.createSpaceshipCommands = [];
        }
    }

    public async stopGame() {
        this.map = null;
        if (this.state.gameStatus === GameStatus.RUNNING) {
            this.state.gameStatus = GameStatus.STOPPING;
            this.state.playerShipIds.splice(0);
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
            this.shipCleanups.clear();
            this.state.gameStatus = GameStatus.STOPPED;
        }
    }

    public async startGame(map: GameMap) {
        if (this.state.gameStatus === GameStatus.STOPPED) {
            this.state.gameStatus = GameStatus.STARTING;
            this.map = map;
            this.shipManagers = new Map<string, ShipManager>();
            this.spaceManager = new SpaceManager();
            map.init(this.scriptApi);
            await this.waitForAllShipRoomsInit();
            this.spaceManager.forceFlushEntities();
            await matchMaker.createRoom('space', { manager: this.spaceManager });
            await this.waitForRoom({ name: 'space' });
            this.state.gameStatus = GameStatus.RUNNING;
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
        for (const [shipId, shipManager] of this.shipManagers.entries()) {
            state.fragment.ship.set(shipId, shipManager.state);
        }
        return state.clone();
    }

    public async loadGame(source: SavedGame, map: GameMap) {
        while (this.state.gameStatus !== GameStatus.STOPPED) {
            // also handle starting and stopping
            await new Promise((res) => setTimeout(res, 100));
            await this.stopGame();
        }
        this.state.gameStatus = GameStatus.STARTING;
        this.map = map;
        this.spaceManager = new SpaceManager();
        this.spaceManager.insertBulk(source.fragment.space);
        await matchMaker.createRoom('space', { manager: this.spaceManager });
        await this.waitForRoom({ name: 'space' });
        for (const [id, shipState] of source.fragment.ship) {
            const so = source.fragment.space.getShip(id);
            if (so) {
                this.initShipManagerAndRoom(so, shipState, shipState.isPlayerShip);
            }
        }
        await this.waitForAllShipRoomsInit();
        this.state.gameStatus = GameStatus.RUNNING;
    }

    private cleanupShip(id: string) {
        const shipCleanup = this.shipCleanups.get(id);
        if (shipCleanup) {
            shipCleanup();
        } else {
            // eslint-disable-next-line no-console
            console.error(`Attempted to clean up ship ${id}, but it does not exist.`);
        }
    }

    private addShip(spaceObject: Spaceship, isPlayerShip: true): ShipManagerPc;
    private addShip(spaceObject: Spaceship, isPlayerShip: false): ShipManagerNpc;
    private addShip(spaceObject: Spaceship, isPlayerShip: boolean): ShipManager;
    private addShip(spaceObject: Spaceship, isPlayerShip: boolean) {
        if (!spaceObject.model) {
            throw new Error(`Missing ship model for ship ${spaceObject.id}`);
        }
        if (this.spaceManager.checkDuplicateShip(spaceObject.id)) {
            throw new Error(`Ship with same ID already exist! ${spaceObject.id}`);
        }
        this.spaceManager.insert(spaceObject);
        const configuration = shipConfigurations[spaceObject.model];
        const shipState = makeShipState(spaceObject.id, configuration);
        const shipManager = this.initShipManagerAndRoom(spaceObject, shipState, isPlayerShip);
        return shipManager;
    }

    private async waitForAllShipRoomsInit() {
        const expectedShipCount = this.shipManagers.size;
        while (expectedShipCount > this.state.shipIds.length) {
            await new Promise((res) => setTimeout(res, 100));
        }
    }

    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: true): ShipManagerPc;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: false): ShipManagerNpc;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: boolean): ShipManager;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: boolean) {
        const id = spaceObject.id;
        const die = new ShipDie(3);
        const managerCtor = isPlayerShip ? ShipManagerPc : ShipManagerNpc;
        const shipManager = new managerCtor(spaceObject, shipState, this.spaceManager, die, this.shipManagers); // create a manager to manage the ship
        this.shipManagers.set(id, shipManager);
        this.dice.push(die);
        const createRoomPromise = matchMaker.createRoom('ship', { manager: shipManager }).then(async () => {
            await this.waitForRoom({ roomId: id, name: 'ship' });
            this.state.shipIds.push(id);
            if (isPlayerShip) {
                this.state.playerShipIds.push(id);
            }
        });
        this.shipCleanups.set(id, async () => {
            await createRoomPromise;
            if (this.shipCleanups.delete(id)) {
                if (isPlayerShip) {
                    this.state.playerShipIds.deleteAt(this.state.playerShipIds.indexOf(id));
                }
                this.state.shipIds.deleteAt(this.state.shipIds.indexOf(id));
                void matchMaker.getRoomById(id).disconnect();
                this.dice.splice(this.dice.indexOf(die), 1);
                this.shipManagers.delete(id);
            }
        });
        return shipManager;
    }

    private async waitForRoom(conditions: Partial<IRoomListingData>) {
        let roomRes = await matchMaker.query(conditions);
        while (!roomRes.length) {
            await new Promise((res) => setTimeout(res, 50));
            roomRes = await matchMaker.query(conditions);
        }
    }
}
