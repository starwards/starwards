import {
    Faction,
    GameApi,
    GameMap,
    GameStatus,
    Order,
    PowerLevel,
    ShipModel,
    Spaceship,
    Vec2,
    XY,
    makeId,
    waitFor,
} from '@starwards/core/internal';
import {
    STATIONS,
    createWaveDefenceMap,
    furthestStationId,
    generateWaveComposition,
    pickWaveTargetStationId,
    sampleWaveSpawnCenter,
    waveBudget,
} from '../scenarios/wave-defence';

import { makeDriver } from './driver';

function makeMap(init: (game: GameApi) => void, update?: (deltaSeconds: number) => void): GameMap {
    return { name: 'test-map', init, update };
}

const stationPositionsById: Record<string, XY> = Object.fromEntries(STATIONS.map((s) => [s.id, s.position]));
const allStationPositions = STATIONS.map((s) => s.position);

describe('waveBudget', () => {
    // The issue's worked example (10/25/42/60/81/105/126/148/174/200) has small arithmetic slips
    // against its own stated formula for waves 4, 5, 6 and 8 (e.g. ceil(4 ** 1.3 * 10) = 61, not
    // 60). The formula is the named, load-bearing rule -- it is what governs budgets past wave 10
    // -- so this test pins waveBudget to Math.ceil(n ** 1.3 * 10) exactly, not the example table.
    it('matches Math.ceil(n ** 1.3 * 10) for waves 1-10', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(waveBudget)).toEqual([10, 25, 42, 61, 82, 103, 126, 150, 174, 200]);
    });
});

describe('generateWaveComposition', () => {
    it('wave 1, always picking the cheapest affordable hull, is exactly two dragonfly-MK1', () => {
        const rng = () => 0; // picks index 0 of the affordable set every time (cheapest-first ordering)
        expect(generateWaveComposition(1, rng)).toEqual(['dragonfly-MK1', 'dragonfly-MK1']);
    });

    it('never exceeds the wave budget and terminates, for waves 1-50 under many random seeds', () => {
        const scoreByModel: Record<string, number> = {
            'dragonfly-MK1': 5,
            'dragonfly-MK2': 8,
            predator: 30,
            glaive: 35,
            cataphract: 50,
        };
        for (let wave = 1; wave <= 50; wave++) {
            for (let seed = 0; seed < 5; seed++) {
                let calls = 0;
                const rng = () => {
                    calls++;
                    return (seed / 5 + calls / 97) % 1;
                };
                const composition = generateWaveComposition(wave, rng);
                const spent = composition.reduce((sum, model) => sum + scoreByModel[model], 0);
                expect(spent).toBeLessThanOrEqual(waveBudget(wave));
                expect(composition.length).toBeLessThan(1000);
            }
        }
    });

    it('only ever produces raider-roster hulls, never freighter or station models', () => {
        const allowed = new Set<ShipModel>(['dragonfly-MK1', 'dragonfly-MK2', 'predator', 'glaive', 'cataphract']);
        const composition = generateWaveComposition(10, () => 0.99);
        for (const model of composition) {
            expect(allowed.has(model)).toBe(true);
        }
    });
});

describe('sampleWaveSpawnCenter', () => {
    it('is always >=120,000m from all three stations, across many samples for waves 1-10 worth of targets', () => {
        for (const station of STATIONS) {
            for (let seed = 0; seed < 50; seed++) {
                const center = sampleWaveSpawnCenter(station.position, allStationPositions, () => (seed + 0.5) / 50);
                for (const other of STATIONS) {
                    expect(XY.lengthOf(XY.difference(center, other.position))).toBeGreaterThanOrEqual(120_000);
                }
            }
        }
    });

    it('is exactly 140,000m from the targeted station', () => {
        const center = sampleWaveSpawnCenter(STATIONS[0].position, allStationPositions, () => 0.5);
        expect(XY.lengthOf(XY.difference(center, STATIONS[0].position))).toBeCloseTo(140_000, 0);
    });
});

describe('pickWaveTargetStationId', () => {
    const allIds = STATIONS.map((s) => s.id);
    const playerPosition = new Vec2(0, 0);

    it('rotates large -> platform -> small for waves 1-3, regardless of player position', () => {
        expect(pickWaveTargetStationId(1, allIds, stationPositionsById, playerPosition)).toEqual('station-large');
        expect(pickWaveTargetStationId(2, allIds, stationPositionsById, playerPosition)).toEqual('station-platform');
        expect(pickWaveTargetStationId(3, allIds, stationPositionsById, playerPosition)).toEqual('station-small');
    });

    it('targets the station furthest from the player from wave 4 onward', () => {
        // player sitting right next to station-large -> furthest is whichever of the other two is farther
        const nearLarge = STATIONS[0].position;
        const target = pickWaveTargetStationId(4, allIds, stationPositionsById, nearLarge);
        expect(target).not.toEqual('station-large');

        const expected = furthestStationId(allIds, stationPositionsById, nearLarge);
        expect(target).toEqual(expected);
    });

    it('moving the player changes the wave-4+ target', () => {
        const near = (id: string) => stationPositionsById[id];
        const targetWhenNearPlatform = pickWaveTargetStationId(
            5,
            allIds,
            stationPositionsById,
            near('station-platform'),
        );
        const targetWhenNearSmall = pickWaveTargetStationId(5, allIds, stationPositionsById, near('station-small'));
        expect(targetWhenNearPlatform).not.toEqual(targetWhenNearSmall);
    });
});

describe('wave_defence map (integration)', () => {
    const gameDriver = makeDriver();

    function npcWaveIds() {
        return [...gameDriver.shipManagers.keys()].filter(
            (id: string) => !STATIONS.some((s) => s.id === id) && id !== 'GVTS',
        );
    }

    /**
     * Ship-manager cleanup (game-manager.ts's `shipCleanups`) awaits a room-creation promise and a
     * remote room call before deleting from `shipManagers` -- it is not synchronous with the
     * `update()` call that drains `destroySpaceshipCommands`. Production ticks are far enough
     * apart (real wall-clock) for this to always have settled by the next tick; back-to-back
     * synchronous `update()` calls in a test are not, so tests must await it explicitly.
     */
    async function waitForShipManagersGone(ids: readonly string[]) {
        await waitFor(
            () => {
                for (const id of ids) {
                    if (gameDriver.shipManagers.has(id)) {
                        throw new Error(`ship manager for ${id} not cleaned up yet`);
                    }
                }
            },
            2000,
            10,
        );
    }

    it('spawns wave 1 (two dragonfly-MK1) targeting station-large at game start', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);

        const npcIds = npcWaveIds();
        expect(npcIds).toHaveLength(2);
        for (const id of npcIds) {
            const ship = gameDriver.getShip(id);
            expect(ship.spaceObject.model).toEqual('dragonfly-MK1');
            expect(ship.state.order).toEqual(Order.NONE); // orders are picked up on a *following* tick
        }

        // orderAttack, issued during init(), needs two ticks to reach automation: the first drains
        // the command into SpaceManager's per-object order table, the second lets ship automation
        // read it (same one-tick lag demonstrated in game-api.spec.ts).
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);
        for (const id of npcIds) {
            const ship = gameDriver.getShip(id);
            expect(ship.state.order).toEqual(Order.ATTACK);
            expect(ship.state.orderTargetId).toEqual('station-large');
        }
    });

    it('re-issues orderAttack at the furthest surviving station when a wave ship loses its target', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20); // orders land

        const [shipId] = npcWaveIds();
        expect(gameDriver.getShip(shipId).state.orderTargetId).toEqual('station-large');

        // Destroy the targeted station directly (it's expendable as an NPC ship) and let the
        // destroy pipeline (spaceManager -> destroySpaceshipCommands -> cleanupShip) fully drain.
        gameDriver.spaceManager.destroyObject('station-large');
        gameDriver.gameManager.update(1 / 20); // drains destroySpaceshipCommands
        await waitForShipManagersGone(['station-large']);

        for (let i = 0; i < 4; i++) {
            gameDriver.gameManager.update(1 / 20); // map.update() sees the gone target, re-issues; then it lands
        }

        const newTarget = gameDriver.getShip(shipId).state.orderTargetId;
        expect(newTarget).not.toEqual('station-large');
        expect(['station-platform', 'station-small']).toContain(newTarget);
    });

    it('spawns the next wave 15s after every ship in the current wave is gone, not sooner', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        const wave1Ids = npcWaveIds();
        for (const id of wave1Ids) {
            gameDriver.spaceManager.destroyObject(id);
        }
        gameDriver.gameManager.update(1 / 20); // drains destroy commands; this same tick's map.update()
        // (which runs *before* the drain) already sees every wave-1 ship as destroyed via
        // getObject().destroyed (set synchronously by destroyObject, no cleanup lag) and starts the
        // 15s timer at 0.05s.
        await waitForShipManagersGone(wave1Ids);

        // paused ticks must not advance the 15s timer
        gameDriver.gameManager.update(0);
        gameDriver.gameManager.update(0);

        for (let i = 0; i < 14; i++) {
            gameDriver.gameManager.update(1); // timer: 0.05 + 14 = 14.05s, still short of 15s
        }
        expect(npcWaveIds()).toHaveLength(0); // wave 2 not spawned yet

        gameDriver.gameManager.update(1.5); // crosses the 15s mark
        expect(npcWaveIds().length).toBeGreaterThan(0);
    });

    it('advances the wave when every raider was converted to a Derelict instead of destroyed (issue #2111)', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        const wave1Ids = npcWaveIds();
        for (const id of wave1Ids) {
            gameDriver.spaceManager.convertToDerelict(id);
        }
        gameDriver.gameManager.update(1 / 20); // drains destroy commands + inserts derelicts
        await waitForShipManagersGone(wave1Ids);

        for (let i = 0; i < 14; i++) {
            gameDriver.gameManager.update(1);
        }
        expect(npcWaveIds()).toHaveLength(0); // wave 2 not spawned yet

        gameDriver.gameManager.update(1.5); // crosses the 15s wave-clear mark
        expect(npcWaveIds().length).toBeGreaterThan(0); // wave 2 spawned: raiders-as-derelicts still counted as gone

        const derelicts = [...gameDriver.spaceManager.state.getAll('Derelict')];
        expect(derelicts).toHaveLength(wave1Ids.length);
    });

    it('still declares defeat when a station is converted to a Derelict instead of destroyed (issue #2111)', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);

        for (const station of STATIONS) {
            gameDriver.spaceManager.convertToDerelict(station.id);
        }
        gameDriver.gameManager.update(1 / 20); // drains destroy commands
        await waitForShipManagersGone(STATIONS.map((s) => s.id));

        gameDriver.gameManager.update(1 / 20); // map.update() now sees no alive stations -> defeat

        expect(gameDriver.gameManager.state.message).toContain('wave 1');
        expect(gameDriver.gameManager.state.speed).toEqual(0);
    });

    it('never converts the player ship, even if convertToDerelict is called directly on it', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);

        gameDriver.spaceManager.convertToDerelict('GVTS');

        expect(gameDriver.getShip('GVTS')).not.toEqual(undefined);
        expect([...gameDriver.spaceManager.state.getAll('Derelict')]).toHaveLength(0);
    });

    it('declares defeat exactly once, pauses via setSpeed(0), and never calls stopGame', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);

        for (const station of STATIONS) {
            gameDriver.spaceManager.destroyObject(station.id);
        }
        gameDriver.gameManager.update(1 / 20); // drains destroy commands
        await waitForShipManagersGone(STATIONS.map((s) => s.id));

        gameDriver.gameManager.update(1 / 20); // map.update() now sees no alive stations -> defeat

        expect(gameDriver.gameManager.state.message).toContain('wave 1');
        expect(gameDriver.gameManager.state.speed).toEqual(0);
        expect(gameDriver.gameManager.state.gameStatus).toEqual(GameStatus.RUNNING); // stopGame() was never called

        const messageAfterFirstDetection = gameDriver.gameManager.state.message;
        gameDriver.gameManager.scriptApi.setMessage('overwritten to prove idempotency');
        gameDriver.gameManager.update(1 / 20);
        expect(gameDriver.gameManager.state.message).not.toEqual(messageAfterFirstDetection); // no re-trigger
    });

    it('never advances the wave-clear timer while paused (deltaSeconds === 0)', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);
        gameDriver.gameManager.update(1 / 20);

        const wave1Ids = npcWaveIds();
        for (const id of wave1Ids) {
            gameDriver.spaceManager.destroyObject(id);
        }
        gameDriver.gameManager.update(1 / 20);
        await waitForShipManagersGone(wave1Ids);

        for (let i = 0; i < 1000; i++) {
            gameDriver.gameManager.update(0);
        }
        expect(npcWaveIds()).toHaveLength(0); // still no wave 2, no matter how many paused ticks pass
    });
});

/**
 * Design redirect (Amir, 2026-08-07) on issue #2084: the idle-power detection-range cut
 * (range scales with sqrt(effectiveness); uncrewed hulls never raise power off the 0.5 default)
 * is fixed *here*, scenario-local to the three stations this map spawns -- not as an engine-wide
 * default for every uncrewed hull. Revised acceptance criteria A1-A3 replace the issue's original
 * ones.
 */
describe('station radar power (issue #2084 design redirect)', () => {
    const gameDriver = makeDriver();
    const stationLargePosition = Vec2.make(stationPositionsById['station-large']);

    function spawnContact(position: Vec2) {
        return gameDriver.gameManager.scriptApi.addNpcSpaceship(
            new Spaceship().init(makeId(), position, 'dragonfly-MK1', Faction.Raiders),
        ).spaceObject.id;
    }

    it('A1: a healthy station-large radar detects a dragonfly-MK1 at 119km -- full design range, no idle-power tax', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);

        const contactId = spawnContact(Vec2.make(XY.add(stationLargePosition, XY.byLengthAndDirection(119_000, 0))));
        gameDriver.gameManager.update(1 / 20); // flushes the contact and recomputes the station's field of view

        expect(gameDriver.spaceManager.isVisible('station-large', contactId)).toBe(true);
    });

    it('A2: a large-station spawned outside the wave-defence map keeps the current half-power detection radius -- the boost is scenario-local', async () => {
        await gameDriver.gameManager.startGame(
            makeMap((game) => {
                game.addNpcSpaceship(
                    new Spaceship().init('station-large', stationLargePosition, 'large-station', Faction.Gravitas),
                );
            }),
        );

        const nearContactId = spawnContact(Vec2.make(XY.add(stationLargePosition, XY.byLengthAndDirection(84_000, 0))));
        const farContactId = spawnContact(Vec2.make(XY.add(stationLargePosition, XY.byLengthAndDirection(119_000, 0))));
        gameDriver.gameManager.update(1 / 20);

        expect(gameDriver.spaceManager.isVisible('station-large', nearContactId)).toBe(true);
        expect(gameDriver.spaceManager.isVisible('station-large', farContactId)).toBe(false);
    });

    it('A3: the wave-defence map does not boost the player ship -- only the three stations it spawns get max radar power', async () => {
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);

        const player = gameDriver.getShip('GVTS');
        expect(player.state.radars.every((radar) => radar.power === PowerLevel.NORMAL)).toBe(true);
    });
});
