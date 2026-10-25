import {
    Faction,
    GameApi,
    GameMap,
    MESSAGE_DISPLAY_SECONDS,
    MESSAGE_HISTORY_LIMIT,
    Order,
} from '@starwards/core/internal';

import { makeDriver } from './driver';
import { newShip } from '../admin/map-helper';

function makeMap(init: (game: GameApi) => void, update?: (deltaSeconds: number) => void): GameMap {
    return { name: 'test-game-api-map', init, update };
}

describe('GameApi (issue #2060)', () => {
    const gameDriver = makeDriver({ manualClock: true });

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

    it('pushMessage records history and queues: each shows for its seconds, then the next; clearMessage advances; history capped; stopGame resets', async () => {
        await gameDriver.gameManager.startGame(makeMap(() => undefined));
        const { scriptApi, state } = gameDriver.gameManager;
        const tick = (seconds: number) => gameDriver.gameManager.update(seconds);

        scriptApi.pushMessage('first');
        scriptApi.pushMessage('second', 2);
        scriptApi.pushMessage('   ');
        expect(state.message).toEqual('first'); // a lone message shows at once
        expect(state.queuedMessages).toEqual(['second']);
        expect(state.messageHistory.map((m) => [m.seq, m.text])).toEqual([
            [1, 'first'],
            [2, 'second'],
        ]);

        tick(MESSAGE_DISPLAY_SECONDS - 1);
        expect(state.message).toEqual('first');
        tick(1);
        expect(state.message).toEqual('second');
        tick(2);
        expect(state.message).toEqual('');

        scriptApi.pushMessage('third');
        scriptApi.pushMessage('fourth');
        scriptApi.clearMessage();
        expect(state.message).toEqual('');
        tick(0);
        expect(state.message).toEqual('fourth');
        expect(state.messageHistory).toHaveLength(4);

        for (let i = 0; i < MESSAGE_HISTORY_LIMIT + 5; i++) scriptApi.pushMessage(`m${i}`);
        expect(state.messageHistory).toHaveLength(MESSAGE_HISTORY_LIMIT);
        expect(state.messageHistory[0].text).toEqual('m5');

        await gameDriver.gameManager.stopGame();
        expect(state.message).toEqual('');
        expect(state.messageHistory).toHaveLength(0);
        expect(state.queuedMessages).toEqual([]);
    });

    it('concurrent messages are all shown in turn, none lost (e.g. several station-lost banners)', async () => {
        await gameDriver.gameManager.startGame(makeMap(() => undefined));
        const { scriptApi, state } = gameDriver.gameManager;
        const seen: string[] = [];
        for (const s of ['A', 'B', 'C']) scriptApi.pushMessage(`station ${s} lost`);
        for (let t = 0; t < 4 * MESSAGE_DISPLAY_SECONDS * 20; t++) {
            if (state.message && seen[seen.length - 1] !== state.message) seen.push(state.message);
            gameDriver.gameManager.update(1 / 20);
        }
        expect(seen).toEqual(['station A lost', 'station B lost', 'station C lost']);
        expect(state.message).toEqual('');
    });

    it('setMessage replaces the current message now and holds it; a queued message takes over after the display time', async () => {
        await gameDriver.gameManager.startGame(makeMap(() => undefined));
        const { scriptApi, state } = gameDriver.gameManager;
        scriptApi.pushMessage('queued first');
        scriptApi.setMessage('Defeat');
        expect(state.message).toEqual('Defeat');
        gameDriver.gameManager.update(1000);
        expect(state.message).toEqual('Defeat'); // held while nothing waits
        scriptApi.pushMessage('later');
        gameDriver.gameManager.update(MESSAGE_DISPLAY_SECONDS);
        expect(state.message).toEqual('later');
        expect(state.messageHistory.map((m) => m.text)).toEqual(['queued first', 'Defeat', 'later']);
    });

    it('a GM tweak edit of message goes through history and shows at once; a blank edit clears it', async () => {
        await gameDriver.gameManager.startGame(makeMap(() => undefined));
        const { state } = gameDriver.gameManager;
        state.message = 'GM: dock now'; // what the tweak's JSON-pointer write does
        gameDriver.gameManager.update(1 / 20);
        expect(state.message).toEqual('GM: dock now');
        expect(state.messageHistory.map((m) => m.text)).toEqual(['GM: dock now']);
        gameDriver.gameManager.update(1000);
        expect(state.message).toEqual('GM: dock now');
        state.message = '';
        gameDriver.gameManager.update(1 / 20);
        expect(state.message).toEqual('');
        expect(state.messageHistory).toHaveLength(1);
    });

    it('convertToDerelict replaces an NPC ship with a Derelict at the same position; no-op on player ships', async () => {
        let npcId = '';
        let playerId = '';
        await gameDriver.gameManager.startGame(
            makeMap((game) => {
                npcId = game.addNpcSpaceship(newShip('DRL', Faction.Raiders, 'demo-ship')).spaceObject.id;
                playerId = game.addPlayerSpaceship(newShip('PLD', Faction.Gravitas, 'demo-ship')).spaceObject.id;
            }),
        );

        gameDriver.gameManager.scriptApi.convertToDerelict(playerId);
        expect(gameDriver.gameManager.scriptApi.getObject(playerId)?.destroyed).not.toBe(true);
        expect([...gameDriver.spaceManager.state.getAll('Derelict')]).toHaveLength(0);

        gameDriver.gameManager.scriptApi.convertToDerelict(npcId);
        expect(gameDriver.gameManager.scriptApi.getObject(npcId)?.destroyed).toBe(true);
        gameDriver.gameManager.update(1 / 20); // flushes the queued Derelict insert
        expect([...gameDriver.spaceManager.state.getAll('Derelict')]).toHaveLength(1);
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

describe('system-broken announcements (issue #2488)', () => {
    const gameDriver = makeDriver({ manualClock: true });

    async function start() {
        let playerId = '';
        let npcId = '';
        await gameDriver.gameManager.startGame(
            makeMap((game) => {
                playerId = game.addPlayerSpaceship(newShip('PLR', Faction.Gravitas, 'demo-ship')).spaceObject.id;
                npcId = game.addNpcSpaceship(newShip('NPC', Faction.Raiders, 'demo-ship')).spaceObject.id;
            }),
        );
        gameDriver.gameManager.update(1 / 20);
        return { playerId, npcId, history: () => gameDriver.gameManager.state.messageHistory.map((m) => m.text) };
    }

    it('queues one message when a player system breaks, none while it stays broken, none for NPCs', async () => {
        const { playerId, npcId, history } = await start();
        const gun = gameDriver.getShip(playerId).state.chainGuns.values().next().value!;
        gameDriver.getShip(npcId).state.chainGuns.values().next().value!.rateOfFireFactor = 0;
        gameDriver.gameManager.update(1 / 20);
        expect(history()).toEqual([]);

        gun.rateOfFireFactor = 0;
        for (let i = 0; i < 5; i++) gameDriver.gameManager.update(1 / 20);
        expect(history()).toHaveLength(1);
        expect(history()[0]).toContain('System broken');
        expect(history()[0]).toContain(playerId);
    });

    it('queues one message per system when several break at once', async () => {
        const { playerId, history } = await start();
        const state = gameDriver.getShip(playerId).state;
        const guns = [...state.chainGuns.values()];
        const broken = guns.length >= 2 ? guns.slice(0, 2) : guns;
        for (const g of broken) g.rateOfFireFactor = 0;
        gameDriver.gameManager.update(1 / 20);
        expect(history()).toHaveLength(broken.length);
    });
});
