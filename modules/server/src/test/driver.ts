import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { adminProperties } from '@starwards/core';
import path from 'path';
import { server } from '../server';
import { stringToSchema } from '../serialization/game-state-serialization';

export function makeDriver() {
    let gameManager: GameManager | null = null;
    let serverInfo: Awaited<ReturnType<typeof server>> | null = null;
    beforeAll(async () => {
        gameManager = new GameManager();
        serverInfo = await server(0, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
    });
    afterAll(async () => {
        await serverInfo?.close();
    });

    afterEach(async () => {
        await gameManager?.stopGame();
    });
    return {
        get addressInfo() {
            if (!serverInfo) throw new Error('missing serverInfo');
            return serverInfo.addressInfo;
        },
        get httpServer() {
            if (!serverInfo) throw new Error('missing serverInfo');
            return serverInfo.httpServer;
        },
        pauseGameCommand() {
            adminProperties.speedCommand.setValue(this.gameManager.state, 0);
        },
        get gameManager() {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
        get spaceManager() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.spaceManager;
        },
        get ships() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.ships;
        },
        getShip(id: string) {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            const ship = gameManager.ships.get(id);
            if (!ship) throw new Error('missing ship ' + id);
            return ship;
        },
        get map() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.map;
        },
        async assertSameState(savedGame: string) {
            const data = await stringToSchema(SavedGame, savedGame);

            expect(data.mapName).toEqual(this.map?.name);
            expect(data.fragment.space).toEqual(this.spaceManager.state);
            expect([...data.fragment.ship]).toEqual([...this.ships].map(([k, v]) => [k, v.state]));
        },
    };
}
