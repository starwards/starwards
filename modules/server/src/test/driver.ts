import { GameManager } from '../admin/game-manager';
import { adminProperties } from '@starwards/model';
import path from 'path';
import { server } from '../server';

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
    };
}
