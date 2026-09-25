import {
    GameApi,
    GameMap,
    IterationData,
    ShipApi,
    ShipDie,
    ShipManager,
    ShipManagerNpc,
    ShipModel,
    SpaceManager,
    Spaceship,
    makeShipState,
    resetIds,
    shipConfigurations,
} from '@starwards/core/internal';

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
 * so automation can fly a ship authored as crew-driven. Player ships stay non-expendable.
 * Calibration only: a player ship flies on NPC automation, which draws no energy and aims with
 * the NPC gunnery.
 */
export class HeadlessGame {
    readonly spaceManager = new SpaceManager();
    private readonly shipManagers = new Map<string, ShipManager>();
    private readonly die: ShipDie;
    private speed = 1;
    private totalSeconds = 0;

    private readonly api: GameApi = {
        getShip: (shipId) => this.shipManagers.get(shipId) as ShipApi | undefined,
        addObject: (obj) => this.spaceManager.insert(obj),
        addPlayerSpaceship: (ship) => this.addShip(ship, true) as never,
        addNpcSpaceship: (ship) => this.addShip(ship, false),
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
        setMessage: () => undefined,
    };

    private constructor(
        private readonly map: GameMap,
        seed: number,
    ) {
        this.die = new ShipDie(seed);
    }

    /** Starts a run from a fresh id sequence, so a seed replays the same run whatever ran before it in the process. */
    static start(map: GameMap, seed: number) {
        resetIds();
        const game = new HeadlessGame(map, seed);
        map.init(game.api);
        game.spaceManager.forceFlushEntities();
        return game;
    }

    get seconds() {
        return this.totalSeconds;
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
        const manager = new ShipManagerNpc(spaceObject, state, this.spaceManager, this.die, this.shipManagers);
        this.shipManagers.set(spaceObject.id, manager);
        return manager;
    }
}
