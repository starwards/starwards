import { Faction, ScanLevel } from '@starwards/core/internal';

import { makeDriver } from './driver';
import supertest from 'supertest';

describe('pause (issue #2022)', () => {
    const gameDriver = makeDriver();

    it('keeps the loop running and totalSeconds frozen while paused, resuming once unpaused', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        gameDriver.pauseGameCommand();

        gameDriver.gameManager.update(1 / 20);
        // @ts-ignore : access private field for test assertion
        const frozenAt: number = gameDriver.gameManager.totalSeconds;

        for (let i = 0; i < 20; i++) {
            gameDriver.gameManager.update(1 / 20);
        }
        // @ts-ignore : access private field for test assertion
        expect(gameDriver.gameManager.totalSeconds).toEqual(frozenAt);

        gameDriver.gameManager.state.speed = 1;
        gameDriver.gameManager.update(1 / 20);
        // @ts-ignore : access private field for test assertion
        expect(gameDriver.gameManager.totalSeconds).toBeGreaterThan(frozenAt);
    });

    it('applies a GM command queued while paused on the next tick, without unpausing', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        gameDriver.pauseGameCommand();
        const shipId = gameDriver.gameManager.state.playerShipIds[0];

        // ship's own faction: always in its own field of view, so a FULL scan level sticks
        // instead of being demoted back to SNAPSHOT by the same tick's passive-demotion pass
        gameDriver.spaceManager.state.setScanLevelCommands.push({
            targetId: shipId,
            faction: Faction.Gravitas,
            level: ScanLevel.FULL,
        });
        gameDriver.gameManager.update(1 / 20);

        expect(gameDriver.spaceManager.factionIntel.getScanLevel(shipId, Faction.Gravitas)).toEqual(ScanLevel.FULL);
        expect(gameDriver.gameManager.state.speed).toEqual(0);
        expect(gameDriver.gameManager.state.isGameRunning).toEqual(true);
    });
});
