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
    XY,
    createLogger,
    isAssignableSeat,
    isSlotTaken,
    makeId,
    makeShipState,
    markStationDisconnected,
    shipConfigurations,
    upsertStationRegistration,
    waitFor,
} from '@starwards/core/internal';

import { SavedGame } from '../serialization/game-state-protocol';
import { deepAssignSchema } from '../serialization/deep-assign-schema';
import { getStationsManifest } from '../stations-manifest';
import { matchMaker } from '@colyseus/core';

const { error: logError } = createLogger('game-manager');

/** How long a disconnected, unassigned station stays in the registry before being pruned. */
const STALE_STATION_GRACE_MS = 30_000;

export class GameManager {
    public state = new AdminState();
    /** Wall-clock timestamp (`Date.now()`) each currently-disconnected station went offline, for the stale-entry prune below. Cleared on reconnect. */
    private disconnectedStationSince = new Map<string, number>();
    private shipCleanups = new Map<string, () => unknown>();
    private convertingShips = new Set<string>();
    private shipManagers = new Map<string, ShipManager>();
    /** Ships whose replay-driven teardown was already scheduled but hasn't finished yet. */
    private replayCleanedShips = new Set<string>();
    private die = new ShipDie();
    public spaceManager = new SpaceManager();
    private map: GameMap | null = null;
    private deltaSecondsAvg = 1 / 20;
    private _totalSeconds = 0;
    /**
     * Set by a ReplayPlayer to receive game-time ticks while `state.gameStatus === REPLAY`,
     * instead of the normal simulation block. `totalSeconds` already scales by `state.speed`,
     * giving replay pause/rate control for free.
     */
    public replayTick?: (totalSeconds: number) => void;
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
        orderAttack: (shipId: string, targetId: string) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'attack', targetId } });
        },
        orderMove: (shipId: string, position: XY) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'move', position } });
        },
        orderFollow: (shipId: string, targetId: string) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'follow', targetId } });
        },
        orderNone: (shipId: string) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'none' } });
        },
        convertToDerelict: (shipId: string) => {
            this.spaceManager.convertToDerelict(shipId);
        },
        getObject: (id: string) => this.spaceManager.state.get(id),
        getObjects: () => this.spaceManager.state,
        setSpeed: (speed: number) => {
            this.state.speed = Math.max(0, Math.min(3, speed));
        },
        setMessage: (message: string) => {
            this.state.message = message;
        },
    };

    public get totalSeconds() {
        return this._totalSeconds;
    }

    update(currDeltaSeconds: number) {
        this.drainStationCommands();
        this.deltaSecondsAvg = this.deltaSecondsAvg * 0.8 + currDeltaSeconds * 0.2;
        const adjustedDeltaSeconds = currDeltaSeconds * this.state.speed;
        this._totalSeconds = this._totalSeconds + adjustedDeltaSeconds;
        if (this.state.gameStatus === GameStatus.REPLAY) {
            this.replayTick?.(this._totalSeconds);
            // A replay is read-only: the recording is the source of truth, and anything applied
            // here would be overwritten by the next frame. Discard rather than let the queues
            // grow for the length of the replay and then fire at once when it ends.
            this.spaceManager.state.discardQueuedCommands();
            return;
        }
        // The loop keeps running even at speed 0 (paused): queued commands (GM edits, scan
        // level, waypoints, ...) must still drain every tick. deltaSeconds is 0 while paused,
        // which freezes simulation math that scales with it; anything that doesn't scale with
        // deltaSeconds is the sub-manager's own responsibility to gate (see SpaceManager.update).
        if (this.state.isGameRunning) {
            const iterationData = {
                deltaSeconds: adjustedDeltaSeconds,
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

    /**
     * Drains `state.registerStationCommands`/`disconnectStationCommands` (see `stations/` in
     * core): applies registration/disconnect bookkeeping generically, validates any requested
     * ship self-assignment against `playerShipIds` + the stations manifest — the one
     * Starwards-specific piece the generic registry module can't do itself — and then
     * reconciles auto-assignment.
     */
    private drainStationCommands() {
        for (const arg of this.state.registerStationCommands) {
            const entry = upsertStationRegistration(this.state.stations, arg.stationId, arg.stationType);
            this.disconnectedStationSince.delete(arg.stationId);
            if (arg.shipId && !entry.shipId && this.isValidStationSlot(arg.shipId, entry.stationType)) {
                entry.shipId = arg.shipId;
            }
        }
        this.state.registerStationCommands = [];
        for (const stationId of this.state.disconnectStationCommands) {
            markStationDisconnected(this.state.stations, stationId);
            this.disconnectedStationSince.set(stationId, Date.now());
        }
        this.state.disconnectStationCommands = [];
        this.reconcileStationAssignments();
        this.pruneStaleStations();
    }

    /**
     * Removes a disconnected, unassigned station's entry once it has sat idle past
     * {@link STALE_STATION_GRACE_MS} — a technician's abandoned/renamed-away id shouldn't
     * clutter the roster forever. A disconnected entry that still holds a ship assignment is
     * left alone: that's the reconnect-sticky assignment the registry exists for.
     */
    private pruneStaleStations() {
        const now = Date.now();
        for (const [stationId, disconnectedAt] of [...this.disconnectedStationSince]) {
            const entry = this.state.stations.get(stationId);
            if (!entry || entry.connected) {
                this.disconnectedStationSince.delete(stationId);
                continue;
            }
            if (!entry.shipId && now - disconnectedAt >= STALE_STATION_GRACE_MS) {
                this.state.stations.delete(stationId);
                this.disconnectedStationSince.delete(stationId);
            }
        }
    }

    /** A station slot is valid when its ship is a current player ship and its type is an enabled seat on that ship. */
    private isValidStationSlot(shipId: string, stationType: string): boolean {
        return (
            this.state.playerShipIds.includes(shipId) &&
            isAssignableSeat(getStationsManifest(shipId).stations[stationType])
        );
    }

    /**
     * Clears assignments whose slot is no longer valid (e.g. after a map switch), then
     * auto-assigns any now-unassigned station that has exactly one open slot for its type
     * across every current player ship. Called after every register/disconnect batch, and
     * after `startGame`/`loadGame` change `playerShipIds`.
     */
    private reconcileStationAssignments() {
        for (const entry of this.state.stations.values()) {
            if (entry.shipId && !this.isValidStationSlot(entry.shipId, entry.stationType)) {
                entry.shipId = '';
            }
        }
        for (const entry of this.state.stations.values()) {
            if (entry.shipId || !entry.stationType) {
                continue;
            }
            const openShips = this.state.playerShipIds.filter(
                (shipId) =>
                    this.isValidStationSlot(shipId, entry.stationType) &&
                    !isSlotTaken(this.state.stations, shipId, entry.stationType, entry.id),
            );
            if (openShips.length === 1) {
                entry.shipId = openShips[0];
            }
        }
    }

    public async stopGame() {
        this.map = null;
        if (this.state.gameStatus === GameStatus.RUNNING || this.state.gameStatus === GameStatus.REPLAY) {
            this.replayTick = undefined;
            this.state.gameStatus = GameStatus.STOPPING;
            // Use registered ship cleanup functions which await pending
            // room creation before disconnecting, preventing race conditions
            // where matchMaker.query() could miss rooms still being created.
            const cleanups = [...this.shipCleanups.values()];
            await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
            const spaceRooms = await matchMaker.query({ name: 'space' });
            for (const spaceRoom of spaceRooms) {
                await matchMaker.remoteRoomCall(spaceRoom.roomId, 'disconnect', []);
            }
            this.die = new ShipDie();
            this.state.playerShipIds.splice(0);
            this.state.shipIds.splice(0);
            this.state.message = '';
            this.shipCleanups.clear();
            this.shipManagers.clear();
            this.replayCleanedShips.clear();
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
            this.reconcileStationAssignments();
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
        const snapshot = state.clone();
        // Objects flagged destroyed are still in state until SpaceManager's next GC. They are
        // gone as far as any player is concerned, so a snapshot must not carry them: a replay
        // never runs that GC, and a loaded save would resurrect them for a tick. Drop a
        // destroyed ship's bridge with it, or the frame describes a ship with no hull.
        for (const destroyed of snapshot.fragment.space[Symbol.iterator](true)) {
            snapshot.fragment.space.delete(destroyed);
            snapshot.fragment.ship.delete(destroyed.id);
        }
        return snapshot;
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
        this.spaceManager.forceFlushEntities();
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
        this.reconcileStationAssignments();
    }

    /**
     * Applies a decoded replay frame onto the live game state in place, instead of tearing
     * down and recreating rooms (see `loadGame`). Space objects are reconciled field-by-field
     * via `deepAssignSchema`; ships additionally get their room lifecycle (create/teardown)
     * driven through the same paths `addShip`/`cleanupShip` already use, since viewers need a
     * real ShipRoom to join, not just synced state.
     */
    public applyReplayFrame(frame: SavedGame) {
        if (this.state.gameStatus !== GameStatus.REPLAY) {
            return;
        }
        // Objects entering and leaving the frame go through SpaceManager, not through
        // deepAssignSchema's own map add/delete: only insert() builds a collision body and a
        // field-of-view for an object, and only the destroyed sweep tears them down again.
        // deepAssignSchema then reconciles the fields of objects that exist in both.
        const frameSpace = frame.fragment.space;
        let removedAny = false;
        for (const existing of this.spaceManager.state) {
            if (!frameSpace.get(existing.id)) {
                existing.destroyed = true;
                removedAny = true;
            }
        }
        if (removedAny) {
            this.spaceManager.forceFlushDestroyed();
        }
        for (const object of frameSpace) {
            if (!this.spaceManager.state.get(object.id)) {
                this.spaceManager.insert(object.clone());
            }
        }
        this.spaceManager.forceFlushEntities();
        deepAssignSchema(this.spaceManager.state, frameSpace);

        const frameShipIds = new Set(frame.fragment.ship.keys());
        for (const id of [...this.shipManagers.keys()]) {
            // teardown is asynchronous and leaves the id in shipManagers until it completes, so
            // without this guard every later frame would schedule the same cleanup again
            if (!frameShipIds.has(id) && !this.replayCleanedShips.has(id)) {
                this.replayCleanedShips.add(id);
                this.cleanupShip(id);
            }
        }
        for (const [id, shipState] of frame.fragment.ship) {
            const existingManager = this.shipManagers.get(id);
            if (existingManager) {
                // A previous frame may have scheduled this manager's asynchronous teardown.
                // The current frame makes it live again, so invalidate that replay-only
                // cleanup before its continuation can remove the restored ship room.
                this.replayCleanedShips.delete(id);
                deepAssignSchema(existingManager.state, shipState);
            } else {
                const spaceObject = this.spaceManager.state.getShip(id);
                if (spaceObject) {
                    this.initShipManagerAndRoom(spaceObject, shipState.clone(), shipState.isPlayerShip);
                }
            }
        }
    }

    private cleanupShip(id: string) {
        const shipCleanup = this.shipCleanups.get(id);
        if (shipCleanup) {
            shipCleanup();
        } else {
            logError(`Attempted to clean up ship ${id}, but it does not exist.`);
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
        spaceObject.expendable = !isPlayerShip;
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
        this.replayCleanedShips.delete(id);
        const managerCtor = isPlayerShip ? ShipManagerPc : ShipManagerNpc;
        const shipManager = new managerCtor(spaceObject, shipState, this.spaceManager, this.die, this.shipManagers); // create a manager to manage the ship
        this.shipManagers.set(id, shipManager);

        // All ships get rooms (PC and NPC alike)
        const isReplaying = () => this.state.gameStatus === GameStatus.REPLAY;
        const createRoomPromise = matchMaker
            .createRoom('ship', { manager: shipManager, isReplaying })
            .then(async () => {
                await this.waitForRoom({ roomId: id, name: 'ship' });
                this.state.shipIds.push(id);
                if (isPlayerShip) {
                    this.state.playerShipIds.push(id);
                }
            });
        this.shipCleanups.set(id, async () => {
            await createRoomPromise;
            // Replay reconciliation can restore this ship while the cleanup waits for its
            // room to finish creating. A restored ship keeps the same manager, so this
            // stale cleanup must become a no-op instead of deleting its room afterward.
            if (this.state.gameStatus === GameStatus.REPLAY && !this.replayCleanedShips.has(id)) {
                return;
            }
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

            // Cancel running automation before conversion so stale smartPilot
            // maneuvering/rotation values don't persist through the async cleanup window.
            shipManager.cancelAllTasks();

            // Update the state's isPlayerShip property
            shipState.isPlayerShip = isPlayerShip;
            spaceObject.expendable = !isPlayerShip;

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
