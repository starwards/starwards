import {
    AdminState,
    GameApi,
    GameMap,
    GameStatus,
    ShipApi,
    ShipDie,
    ShipManager,
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
    waitFor,
} from '@starwards/core/internal';

import { SavedGame } from '../serialization/game-state-protocol';
import { matchMaker } from '@colyseus/core';
export class GameManager {
    public state = new AdminState();
    private shipCleanups = new Map<string, () => unknown>();
    private convertingShips = new Set<string>();
    private shipManagers = new Map<string, ShipManager>();
    private die = new ShipDie();
    public spaceManager = new SpaceManager();
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
            this.die.update(iterationData);
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
            for (const cmd of this.spaceManager.state.convertShipTypeCommands) {
                void this.convertShipType(cmd.shipId, cmd.isPlayerShip);
            }
            this.spaceManager.state.convertShipTypeCommands = [];
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
            this.die = new ShipDie();
            this.shipCleanups.clear();
            this.convertingShips.clear();
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
        await waitFor(
            async () => {
                if (this.state.gameStatus !== GameStatus.STOPPED) {
                    await this.stopGame();
                    throw new Error('Waiting for game to stop');
                }
            },
            10000,
            100,
        );
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
        // All ships (PC and NPC) have rooms now, wait for all managers to appear in shipIds
        const expectedShipCount = this.shipManagers.size;
        await waitFor(
            () => {
                if (expectedShipCount > this.state.shipIds.length) {
                    throw new Error('Waiting for ship rooms to initialize');
                }
            },
            10000,
            100,
        );
    }

    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: true): ShipManagerPc;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: false): ShipManagerNpc;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: boolean): ShipManager;
    private initShipManagerAndRoom(spaceObject: Spaceship, shipState: ShipState, isPlayerShip: boolean) {
        const id = spaceObject.id;
        const managerCtor = isPlayerShip ? ShipManagerPc : ShipManagerNpc;
        const shipManager = new managerCtor(spaceObject, shipState, this.spaceManager, this.die, this.shipManagers); // create a manager to manage the ship
        this.shipManagers.set(id, shipManager);

        // All ships get rooms (PC and NPC alike)
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
                    this.state.playerShipIds.splice(this.state.playerShipIds.indexOf(id), 1);
                }
                this.state.shipIds.splice(this.state.shipIds.indexOf(id), 1);
                await matchMaker.remoteRoomCall(id, 'disconnect', []);
                this.shipManagers.delete(id);
            }
        });

        return shipManager;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async waitForRoom(conditions: Record<string, any>) {
        await waitFor(
            async () => {
                const roomRes = await matchMaker.query(conditions);
                if (!roomRes.length) {
                    throw new Error('Waiting for room to be created');
                }
            },
            10000,
            50,
        );
    }

    /**
     * Converts a ship between player and NPC types.
     * Both types have ShipRooms. This closes the existing room and
     * recreates the manager with the correct type (ShipManagerPc or ShipManagerNpc).
     */
    public async convertShipType(shipId: string, isPlayerShip: boolean) {
        if (this.convertingShips.has(shipId)) return;
        this.convertingShips.add(shipId);
        try {
            const shipManager = this.shipManagers.get(shipId);
            if (!shipManager) {
                throw new Error(`Ship ${shipId} not found`);
            }

            // Check if conversion is needed
            const currentIsPlayerShip = this.state.playerShipIds.includes(shipId);
            if (currentIsPlayerShip === isPlayerShip) {
                // No conversion needed
                return;
            }

            // Get the current ship state and space object from space manager
            const shipState = shipManager.state;
            const spaceObject = this.spaceManager.state.getShip(shipId);
            if (!spaceObject) {
                throw new Error(`Ship ${shipId} not found in space manager`);
            }

            // Update the state's isPlayerShip property
            shipState.isPlayerShip = isPlayerShip;

            // Clean up the existing ship manager (and room if it was a player ship)
            const cleanup = this.shipCleanups.get(shipId);
            if (cleanup) {
                await cleanup();
            }

            // Fix shipIds bookkeeping before re-init:
            // Cleanup removes from shipIds; initShipManagerAndRoom re-adds async.
            // Normalize: remove from shipIds if still present.
            const shipIdsIdx = this.state.shipIds.indexOf(shipId);
            if (shipIdsIdx !== -1) {
                this.state.shipIds.splice(shipIdsIdx, 1);
            }

            // Recreate the ship manager (with room only if player ship)
            const freshShipState = shipState.clone();
            this.initShipManagerAndRoom(spaceObject, freshShipState, isPlayerShip);

            // Both paths: initShipManagerAndRoom adds to shipIds (and playerShipIds if PC) async.
            // Wait for room creation to complete so state is consistent on return.
            await waitFor(
                () => {
                    if (!this.state.shipIds.includes(shipId)) {
                        throw new Error('Waiting for ship room to initialize');
                    }
                },
                10000,
                50,
            );
        } finally {
            this.convertingShips.delete(shipId);
        }
    }
}
