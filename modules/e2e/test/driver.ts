import * as path from 'path';

import { GameManager } from '@starwards/server/src/admin/game-manager';
import { server } from '@starwards/server/src/server';
import { test } from '@playwright/test';

export function makeDriver(t: typeof test) {
    let gameManager: GameManager | null = null;
    t.beforeAll(async () => {
        gameManager = new GameManager();
        await server(8080, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
    });

    t.afterEach(async () => {
        await gameManager?.stopGame();
    });
    return {
        get gameManager() {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
    };
}
