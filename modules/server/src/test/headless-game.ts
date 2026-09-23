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
    SpaceManager,
    Spaceship,
    XY,
    makeShipState,
    shipConfigurations,
} from '@starwards/core/internal';

import { SavedGame } from '../serialization/game-state-protocol';

/**
 * The live server's tick rate: `SpaceRoom` calls `setSimulationInterval` without a delay, so
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
 * as a crew would. `labFreeEnergy` (lab-only) lets that crew draw free energy the way NPC managers
 * do, standing in for the engineer the harness doesn't model. Player ships stay non-expendable.
 *
 * {@link saveGame} and {@link HeadlessGame.restore} round-trip through the same `SavedGame` a
 * recording frame holds, so any frame is a branch point. The die is rebuilt from `seed` +
 * elapsed seconds (its whole state); a map's own closure state (e.g. wave-defence's wave
 * counter) is not in the snapshot and restarts fresh.
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
        private readonly labFreeEnergy = false,
    ) {
        this.die = new ShipDie(seed);
        this.die.update({ deltaSeconds: totalSeconds, deltaSecondsAvg: totalSeconds, totalSeconds });
    }

    static start(
        map: GameMap,
        seed: number,
        { crewedPlayer = false, labFreeEnergy = false }: { crewedPlayer?: boolean; labFreeEnergy?: boolean } = {},
    ) {
        const game = new HeadlessGame(map, seed, 0, crewedPlayer, labFreeEnergy);
        map.init(game.api);
        game.spaceManager.forceFlushEntities();
        return game;
    }

    /** Resumes from a snapshot taken `seconds` into a run started with `seed`. Does not call `map.init`. */
    static restore(saved: SavedGame, map: GameMap, seed: number, seconds: number) {
        const game = new HeadlessGame(map, seed, seconds);
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
            game.shipManagers.set(
                id,
                new ShipManagerNpc(spaceObject, shipState, game.spaceManager, game.die, game.shipManagers),
            );
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
        const manager =
            authoredAsPlayer && this.crewedPlayer
                ? new ShipManagerPc(spaceObject, state, this.spaceManager, this.die, this.shipManagers)
                : new ShipManagerNpc(spaceObject, state, this.spaceManager, this.die, this.shipManagers);
        if (manager instanceof ShipManagerPc && this.labFreeEnergy) {
            // the same free draw ShipManagerNpc's constructor installs
            (manager as unknown as { internalProxy: { trySpendEnergy: () => boolean } }).internalProxy.trySpendEnergy =
                () => true;
        }
        this.shipManagers.set(spaceObject.id, manager);
        return manager;
    }
}
