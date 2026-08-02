import { Faction, GameApi, GameMap, Order } from '@starwards/core/internal';

import { makeDriver } from './driver';
import { newShip } from '../admin/map-helper';

/**
 * Builds a GameMap whose init/update hooks are supplied by the test, capturing the
 * GameApi instance so `update` can drive the same script surface issue #2060 adds.
 */
function makeTestMap(init: (game: GameApi) => void, update?: (game: GameApi, deltaSeconds: number) => void): GameMap {
    let api: GameApi;
    return {
        name: 'script-api-test-map',
        init: (game) => {
            api = game;
            init(game);
        },
        update: update ? (deltaSeconds: number) => update(api, deltaSeconds) : undefined,
    };
}

describe('GameApi script surface (issue #2060)', () => {
    const gameDriver = makeDriver();

    it('applies an orderAttack issued through GameApi to the NPC on the following tick', async () => {
        await gameDriver.gameManager.startGame(
            makeTestMap((game) => {
                game.addNpcSpaceship(newShip('hunter', Faction.Gravitas, 'gravitas'));
                game.addNpcSpaceship(newShip('prey', Faction.Raiders, 'gravitas'));
            }),
        );

        gameDriver.gameManager.scriptApi.orderAttack('hunter', 'prey');
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        const hunterState = gameDriver.getShip('hunter').state;
        expect(hunterState.order).toEqual(Order.ATTACK);
        expect(hunterState.orderTargetId).toEqual('prey');
    });

    it('ignores an order issued to a player ship', async () => {
        await gameDriver.gameManager.startGame(
            makeTestMap((game) => {
                game.addPlayerSpaceship(newShip('pc', Faction.Gravitas, 'gravitas'));
                game.addNpcSpaceship(newShip('prey', Faction.Raiders, 'gravitas'));
            }),
        );

        gameDriver.gameManager.scriptApi.orderAttack('pc', 'prey');
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        const pcState = gameDriver.getShip('pc').state;
        expect(pcState.order).toEqual(Order.NONE);
    });

    it('setSpeed clamps to the declared [0, 3] range', async () => {
        await gameDriver.gameManager.startGame(makeTestMap(() => undefined));

        gameDriver.gameManager.scriptApi.setSpeed(10);
        expect(gameDriver.gameManager.state.speed).toEqual(3);

        gameDriver.gameManager.scriptApi.setSpeed(-5);
        expect(gameDriver.gameManager.state.speed).toEqual(0);
    });

    it('setSpeed(0) freezes simulation while map.update keeps firing with deltaSeconds === 0', async () => {
        const deltas: number[] = [];
        await gameDriver.gameManager.startGame(
            makeTestMap(
                () => undefined,
                (_game, deltaSeconds) => deltas.push(deltaSeconds),
            ),
        );

        gameDriver.gameManager.scriptApi.setSpeed(0);
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        expect(deltas).toEqual([0, 0]);
        // @ts-ignore : access private field for test assertion
        expect(gameDriver.gameManager.totalSeconds).toEqual(0);
    });

    it('does not advance a script accumulator gated on deltaSeconds > 0 while paused', async () => {
        let accumulated = 0;
        await gameDriver.gameManager.startGame(
            makeTestMap(
                () => undefined,
                (_game, deltaSeconds) => {
                    if (deltaSeconds > 0) accumulated += deltaSeconds;
                },
            ),
        );

        gameDriver.gameManager.scriptApi.setSpeed(0);
        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        expect(accumulated).toEqual(0);
    });

    it('setMessage is synced on AdminState and cleared by stopGame', async () => {
        await gameDriver.gameManager.startGame(makeTestMap(() => undefined));

        gameDriver.gameManager.scriptApi.setMessage('Wave incoming!');
        expect(gameDriver.gameManager.state.message).toEqual('Wave incoming!');

        await gameDriver.gameManager.stopGame();
        expect(gameDriver.gameManager.state.message).toEqual('');
    });

    it('getObject/getObjects expose a read-only view of the spawned space objects', async () => {
        await gameDriver.gameManager.startGame(
            makeTestMap((game) => {
                game.addNpcSpaceship(newShip('hunter', Faction.Gravitas, 'gravitas'));
                game.addNpcSpaceship(newShip('prey', Faction.Raiders, 'gravitas'));
            }),
        );

        const api = gameDriver.gameManager.scriptApi;
        expect(api.getObject('hunter')?.id).toEqual('hunter');
        expect(api.getObject('missing')).toBeUndefined();
        expect([...api.getObjects()].map((o) => o.id).sort()).toEqual(['hunter', 'prey']);
    });

    it('drives the whole surface end to end: spawn, order, query, message, pause', async () => {
        await gameDriver.gameManager.startGame(
            makeTestMap(
                (game) => {
                    game.addNpcSpaceship(newShip('hunter', Faction.Gravitas, 'gravitas'));
                    game.addNpcSpaceship(newShip('prey', Faction.Raiders, 'gravitas'));
                },
                (game) => {
                    if (game.getObject('prey')) {
                        game.orderAttack('hunter', 'prey');
                        game.setMessage('Engage!');
                        game.setSpeed(0);
                    }
                },
            ),
        );

        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);

        expect(gameDriver.getShip('hunter').state.order).toEqual(Order.ATTACK);
        expect(gameDriver.getShip('hunter').state.orderTargetId).toEqual('prey');
        expect(gameDriver.gameManager.state.message).toEqual('Engage!');
        expect(gameDriver.gameManager.state.speed).toEqual(0);
    });
});
