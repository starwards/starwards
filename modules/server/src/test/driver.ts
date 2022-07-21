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
        async startGameCommand() {
            adminProperties.shouldGameBeRunning.setValue(this.gameManager.state, true);
            await this.gameManager.update(1);
        },
        async stopGameCommand() {
            adminProperties.shouldGameBeRunning.setValue(this.gameManager.state, false);
            await this.gameManager.update(1);
        },
        get gameManager() {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
    };
}
