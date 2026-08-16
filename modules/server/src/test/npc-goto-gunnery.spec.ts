import { Faction, GameApi, GameMap, IdleStrategy, Order, Spaceship, Vec2, XY } from '@starwards/core/internal';

import { makeDriver } from './driver';

/**
 * The manual test that failed on this branch, reproduced end-to-end through the real game stack:
 * open a game with two ships of different factions (one PC, one NPC), set the NPC to roaming, and
 * give it a *go-to* order along a route that hands it excellent shots at the PC ship. It never
 * opens fire.
 *
 * This goes through `scriptApi.orderMove` -- the exact call the GM's "go to" button makes -- so it
 * covers the whole `botOrderCommands` -> `SpaceManager.update` -> `objectOrder` ->
 * `AutomationManager.getAndApplyOrder` pipeline that a core-level test writing `state.order`
 * directly would skip. A single fixed case: booting an HTTP/Colyseus server per run makes this far
 * too slow to randomize -- the randomized sweep lives in
 * `modules/core/test/npc-goto-gunnery.spec.ts`.
 */

const NPC_ID = 'RAIDER';
const PC_ID = 'GVTS';

/** Route start, the PC's parking spot, and the go-to destination, all on one line. */
const NPC_START: XY = { x: 0, y: 0 };
const DESTINATION: XY = { x: 20_000, y: 0 };
/** 1,500m off the route at its midpoint -- well inside the dragonfly-MK1 gun's 500-4,500m band. */
const PC_POSITION: XY = { x: 10_000, y: 1_500 };

function makeMap(): GameMap {
    return {
        name: 'npc-goto-gunnery',
        init: (game: GameApi) => {
            const pc = new Spaceship().init(PC_ID, Vec2.make(PC_POSITION), 'demo-ship', Faction.Gravitas);
            game.addPlayerSpaceship(pc);

            const npc = new Spaceship().init(NPC_ID, Vec2.make(NPC_START), 'dragonfly-MK1', Faction.Raiders);
            const npcApi = game.addNpcSpaceship(npc);
            // The engine-wide default is PLAY_DEAD (hold fire); the manual test set roaming, which
            // is what `runGunnery` needs to engage without an order. Set the same way
            // wave-defence.ts sets STAND_GROUND on its stations.
            npcApi.state.idleStrategy = IdleStrategy.ROAM;
        },
    };
}

describe('NPC given a go-to order past a hostile player ship', () => {
    const gameDriver = makeDriver();

    it('opens fire on the PC ship it flies past', async () => {
        await gameDriver.gameManager.startGame(makeMap());

        gameDriver.gameManager.scriptApi.orderMove(NPC_ID, DESTINATION);

        const npc = gameDriver.getShip(NPC_ID);
        const guns = npc.state.chainGuns;
        const minRange = Math.min(...guns.map((g) => g.design.minShellRange));
        const maxRange = Math.max(...guns.map((g) => g.design.maxShellRange));

        let firingTicks = 0;
        let opportunityTicks = 0;
        let minDistance = Infinity;
        // The order arrives a tick or two after the call and is cleared again on arrival, so the
        // only honest way to see it is to watch for it. Reading `state.order` at the end accepts
        // `NONE` — which is also its value when the order never landed at all.
        let sawMoveOrder = false;

        // 150 sim-seconds is comfortably more than the transit needs, and far more than the ~1
        // sim-second a freshly-spawned NPC's systems take to ramp up to firing effectiveness.
        for (let i = 0; i < 150 * 20; i++) {
            gameDriver.gameManager.update(1 / 20);
            sawMoveOrder ||= npc.state.order === Order.MOVE;
            const distance = XY.lengthOf(
                XY.difference(gameDriver.getShip(PC_ID).spaceObject.position, npc.spaceObject.position),
            );
            minDistance = Math.min(minDistance, distance);
            if (distance >= minRange && distance <= maxRange) {
                opportunityTicks++;
            }
            if (guns.some((gun) => gun.isFiring)) {
                firingTicks++;
            }
        }

        const distanceToDestination = XY.lengthOf(XY.difference(DESTINATION, npc.spaceObject.position));
        const report =
            `sawMoveOrder=${sawMoveOrder}, order=${Order[npc.state.order]}, ` +
            `distanceToDestination=${Math.round(distanceToDestination)}m, opportunityTicks=${opportunityTicks}, ` +
            `firingTicks=${firingTicks}, minDistance=${Math.round(minDistance)}m`;

        // The go-to order actually landed and was actually flown -- the NPC starts 20,000m from the
        // destination -- and the route really did present shots...
        expect(sawMoveOrder ? 'ordered' : `never took the order (${report})`).toEqual('ordered');
        expect(
            distanceToDestination < 2_000
                ? 'arrived'
                : `stopped ${Math.round(distanceToDestination)}m short (${report})`,
        ).toEqual('arrived');
        expect(opportunityTicks).toBeGreaterThan(20);
        // ...so a roaming NPC should have taken at least one of them. Jest's `expect` carries no
        // message argument, so the diagnostic rides in the compared value.
        expect(firingTicks > 0 ? 'fired' : `never fired (${report})`).toEqual('fired');
    });
});
