import {
    GameApi,
    GameMap,
    IterationData,
    Order,
    ShipApi,
    ShipDie,
    ShipManager,
    ShipManagerNpc,
    ShipManagerPc,
    ShipModel,
    ShipState,
    SpaceManager,
    Spaceship,
    XY,
    makeShipState,
    resetIds,
    shipConfigurations,
} from '@starwards/core/internal';

import { SavedGame } from '../serialization/game-state-protocol';

/**
 * The live server's tick rate: `AdminRoom` calls `setSimulationInterval` without a delay, so
 * Colyseus' default (1000/60 ms) applies. Outcomes are tick-rate dependent (blast dwell and
 * first-contact overlap both scale with it), so headless runs default to this rate.
 */
export const SERVER_TICK_HZ = 60;

/**
 * A `GameMap` runner with no Colyseus, no rooms and no wall clock -- `GameManager.update`'s
 * simulation block and nothing else, so a scenario runs as fast as the CPU allows.
 *
 * Every ship gets an NPC manager -- including ones the scenario adds via `addPlayerSpaceship`,
 * so automation can fly a ship authored as crew-driven -- unless `crewedPlayer` is set: then
 * player ships get the player manager (smart pilot modes, energy, repair) and a harness drives them
 * as a crew would. Player ships stay non-expendable. Calibration only: without `crewedPlayer` a
 * player ship flies on NPC automation, which draws no energy and aims with the NPC gunnery.
 *
 * {@link saveGame} and {@link HeadlessGame.restore} round-trip through the same `SavedGame` a
 * recording frame holds, so any frame is a branch point. The die is rebuilt from `seed` +
 * elapsed seconds (its whole state). Not in the snapshot, so not continued by a restore: a map's
 * own closure state (e.g. wave-defence's wave counter), which restarts fresh, and each NPC's aggro
 * (`ShipState.threat`, server-only), which is lost -- a restored raider has no aggro character.
 */
export class HeadlessGame {
    readonly spaceManager = new SpaceManager();
    readonly shipManagers = new Map<string, ShipManager>();
    private readonly die: ShipDie;
    private speed = 1;
    message = '';

    readonly api: GameApi = {
        getShip: (shipId) => this.shipManagers.get(shipId) as ShipApi | undefined,
        addObject: (obj) => this.spaceManager.insert(obj),
        addPlayerSpaceship: (ship) => this.addShip(ship, true) as never,
        addNpcSpaceship: (ship) => this.addShip(ship, false) as ShipManagerNpc,
        stopGame: () => {
            this.speed = 0;
        },
        orderAttack: (shipId, targetId) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'attack', targetId } });
        },
        orderMove: (shipId, position) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'move', position } });
        },
        orderFollow: (shipId, targetId) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'follow', targetId } });
        },
        orderNone: (shipId) => {
            this.spaceManager.state.botOrderCommands.push({ ids: [shipId], order: { type: 'none' } });
        },
        convertToDerelict: (shipId) => this.spaceManager.convertToDerelict(shipId),
        getObject: (id) => this.spaceManager.state.get(id),
        getObjects: () => this.spaceManager.state,
        setSpeed: (speed) => {
            this.speed = Math.max(0, Math.min(3, speed));
        },
        setMessage: (message) => {
            this.message = message;
        },
    };

    private constructor(
        private readonly map: GameMap,
        readonly seed: number,
        private totalSeconds: number,
        private readonly crewedPlayer = false,
    ) {
        this.die = new ShipDie(seed);
        this.die.update({ deltaSeconds: totalSeconds, deltaSecondsAvg: totalSeconds, totalSeconds });
    }

    /** Starts a run from a fresh id sequence, so a seed replays the same run whatever ran before it in the process. */
    static start(map: GameMap, seed: number, { crewedPlayer = false }: { crewedPlayer?: boolean } = {}) {
        resetIds();
        const game = new HeadlessGame(map, seed, 0, crewedPlayer);
        map.init(game.api);
        game.spaceManager.forceFlushEntities();
        return game;
    }

    /**
     * Resumes from a snapshot taken `seconds` into a run started with `seed` and the same
     * `crewedPlayer`. Does not call `map.init`.
     */
    static restore(
        saved: SavedGame,
        map: GameMap,
        seed: number,
        seconds: number,
        { crewedPlayer = false }: { crewedPlayer?: boolean } = {},
    ) {
        const game = new HeadlessGame(map, seed, seconds, crewedPlayer);
        game.spaceManager.insertBulk(saved.fragment.space);
        game.spaceManager.forceFlushEntities();
        for (const [id, shipState] of saved.fragment.ship) {
            const spaceObject = game.spaceManager.state.getShip(id);
            if (!spaceObject) {
                continue;
            }
            // Constructing the manager resets the order, and the running automation task is a
            // closure rather than state -- so capture the saved order first and re-issue it.
            const { order, orderTargetId } = shipState;
            const orderPosition = XY.clone(shipState.orderPosition);
            game.shipManagers.set(id, game.makeManager(spaceObject, shipState, !spaceObject.expendable));
            if (order === Order.ATTACK && orderTargetId) {
                game.api.orderAttack(id, orderTargetId);
            } else if (order === Order.MOVE) {
                game.api.orderMove(id, orderPosition);
            } else if (order === Order.FOLLOW && orderTargetId) {
                game.api.orderFollow(id, orderTargetId);
            }
        }
        return game;
    }

    get stopped() {
        return this.speed === 0;
    }

    get seconds() {
        return this.totalSeconds;
    }

    get mapName() {
        return this.map.name;
    }

    /** Same shape as `GameManager.saveGame`: destroyed objects dropped, one `ShipState` per live ship. */
    saveGame(): SavedGame {
        const state = new SavedGame();
        state.mapName = this.map.name;
        this.spaceManager.forceFlushEntities();
        state.fragment.space = this.spaceManager.state;
        for (const [shipId, shipManager] of this.shipManagers) {
            state.fragment.ship.set(shipId, shipManager.state);
        }
        const snapshot = state.clone();
        for (const destroyed of snapshot.fragment.space[Symbol.iterator](true)) {
            snapshot.fragment.space.delete(destroyed);
            snapshot.fragment.ship.delete(destroyed.id);
        }
        return snapshot;
    }

    /** One tick, in `GameManager.update` order. */
    tick(deltaSeconds: number) {
        const adjusted = deltaSeconds * this.speed;
        this.totalSeconds += adjusted;
        const iterationData: IterationData = {
            deltaSeconds: adjusted,
            deltaSecondsAvg: adjusted,
            totalSeconds: this.totalSeconds,
        };
        this.map.update?.(adjusted);
        this.die.update(iterationData);
        for (const shipManager of this.shipManagers.values()) {
            shipManager.update(iterationData);
        }
        this.spaceManager.update(iterationData);
        for (const id of this.spaceManager.state.destroySpaceshipCommands) {
            this.shipManagers.delete(id);
        }
        this.spaceManager.state.destroySpaceshipCommands = [];
        this.spaceManager.state.createSpaceshipCommands = [];
        this.spaceManager.state.convertShipTypeCommands = [];
    }

    private addShip(spaceObject: Spaceship, authoredAsPlayer: boolean) {
        spaceObject.expendable = !authoredAsPlayer;
        this.spaceManager.insert(spaceObject);
        const state = makeShipState(spaceObject.id, shipConfigurations[spaceObject.model as ShipModel]);
        const manager = this.makeManager(spaceObject, state, authoredAsPlayer);
        this.shipManagers.set(spaceObject.id, manager);
        return manager;
    }

    private makeManager(spaceObject: Spaceship, state: ShipState, playerShip: boolean) {
        return playerShip && this.crewedPlayer
            ? new ShipManagerPc(spaceObject, state, this.spaceManager, this.die, this.shipManagers)
            : new ShipManagerNpc(spaceObject, state, this.spaceManager, this.die, this.shipManagers);
    }
}
