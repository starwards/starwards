import { Faction, GameApi, GameMap, Order } from '@starwards/core/internal';

import { makeDriver } from './driver';
import { newShip } from '../admin/map-helper';

function makeMap(init: (game: GameApi) => void, update?: (deltaSeconds: number) => void): GameMap {
    return { name: 'test-game-api-map', init, update };
}

describe('GameApi (issue #2060)', () => {
    const gameDriver = makeDriver();

    it('picks up an orderAttack on the following tick, and ignores it for player ships', async () => {
        let attackerId = '';
        let targetId = '';
        let playerId = '';
        await gameDriver.gameManager.startGame(
            makeMap((game) => {
                attackerId = game.addNpcSpaceship(newShip('ATK', Faction.Raiders, 'demo-ship')).spaceObject.id;
                targetId = game.addNpcSpaceship(newShip('TGT', Faction.Gravitas, 'demo-ship')).spaceObject.id;
                playerId = game.addPlayerSpaceship(newShip('PLR', Faction.Gravitas, 'demo-ship')).spaceObject.id;
            }),
        );

        gameDriver.gameManager.scriptApi.orderAttack(attackerId, targetId);
        gameDriver.gameManager.scriptApi.orderAttack(playerId, targetId);

        gameDriver.gameManager.update(1 / 20);
        expect(gameDriver.getShip(attackerId).state.order).toEqual(Order.NONE);

        gameDriver.gameManager.update(1 / 20);
        const attacker = gameDriver.getShip(attackerId);
        expect(attacker.state.order).toEqual(Order.ATTACK);
        expect(attacker.state.orderTargetId).toEqual(targetId);

        // player ships ignore GM/script orders
        expect(gameDriver.getShip(playerId).state.order).toEqual(Order.NONE);
    });

    it('setSpeed clamps to [0, 3] and freezes the sim while still calling map.update', async () => {
        const updateDeltas: number[] = [];
        await gameDriver.gameManager.startGame(
            makeMap(
                () => undefined,
                (dt) => updateDeltas.push(dt),
            ),
        );

        gameDriver.gameManager.scriptApi.setSpeed(10);
        expect(gameDriver.gameManager.state.speed).toEqual(3);

        gameDriver.gameManager.scriptApi.setSpeed(0);
        expect(gameDriver.gameManager.state.speed).toEqual(0);

        gameDriver.gameManager.scriptApi.setSpeed(-5);
        expect(gameDriver.gameManager.state.speed).toEqual(0);

        gameDriver.gameManager.update(1 / 20);
        gameDriver.gameManager.update(1 / 20);
        expect(updateDeltas).toEqual([0, 0]);
    });

    it('setMessage is synced on AdminState and cleared by stopGame', async () => {
        await gameDriver.gameManager.startGame(makeMap(() => undefined));

        gameDriver.gameManager.scriptApi.setMessage('wave 1 incoming');
        expect(gameDriver.gameManager.state.message).toEqual('wave 1 incoming');

        await gameDriver.gameManager.stopGame();
        expect(gameDriver.gameManager.state.message).toEqual('');
    });

    it('getObject/getObjects expose a read-only view of live space objects', async () => {
        let shipId = '';
        await gameDriver.gameManager.startGame(
            makeMap((game) => {
                shipId = game.addNpcSpaceship(newShip('OBS', Faction.Raiders, 'demo-ship')).spaceObject.id;
            }),
        );

        expect(gameDriver.gameManager.scriptApi.getObject(shipId)?.id).toEqual(shipId);
        expect(gameDriver.gameManager.scriptApi.getObject('missing')).toBeUndefined();
        const allIds = [...gameDriver.gameManager.scriptApi.getObjects()].map((o) => o.id);
        expect(allIds).toContain(shipId);
    });

    it('drives a whole wave script end to end: spawn, gated update, order, query, message, pause', async () => {
        let elapsedWhileRunning = 0;
        let waveTriggered = false;
        let attackerId = '';
        let targetId = '';

        await gameDriver.gameManager.startGame(
            makeMap(
                (game) => {
                    attackerId = game.addNpcSpaceship(newShip('WV1', Faction.Raiders, 'demo-ship')).spaceObject.id;
                    targetId = game.addNpcSpaceship(newShip('WV2', Faction.Gravitas, 'demo-ship')).spaceObject.id;
                },
                (deltaSeconds) => {
                    // the update hook fires every tick, including while paused (deltaSeconds === 0);
                    // script logic that accumulates time must gate on deltaSeconds > 0
                    if (deltaSeconds > 0) {
                        elapsedWhileRunning += deltaSeconds;
                    }
                    if (!waveTriggered) {
                        const target = gameDriver.gameManager.scriptApi.getObject(targetId);
                        if (target) {
                            gameDriver.gameManager.scriptApi.orderAttack(attackerId, targetId);
                            gameDriver.gameManager.scriptApi.setMessage('wave incoming');
                            waveTriggered = true;
                        }
                    }
                },
            ),
        );

        gameDriver.gameManager.scriptApi.setSpeed(0);
        gameDriver.gameManager.update(1 / 20); // paused: map.update still runs and triggers the wave
        expect(elapsedWhileRunning).toEqual(0);
        expect(waveTriggered).toBe(true);
        expect(gameDriver.gameManager.state.message).toEqual('wave incoming');

        gameDriver.gameManager.scriptApi.setSpeed(1);
        gameDriver.gameManager.update(1 / 20); // unpaused: order lands, time advances
        expect(elapsedWhileRunning).toBeGreaterThan(0);
        expect(gameDriver.getShip(attackerId).state.order).toEqual(Order.ATTACK);
        expect(gameDriver.getShip(attackerId).state.orderTargetId).toEqual(targetId);
    });
});
