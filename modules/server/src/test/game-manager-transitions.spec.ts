import { GameStatus } from '@starwards/core/internal';

import { makeDriver } from './driver';
import { test_map_1 } from '../maps';

describe('GameManager status transitions', () => {
    const gameDriver = makeDriver({ manualClock: true });

    it('stopGame issued while the game is starting waits for it and stops it', async () => {
        const { gameManager } = gameDriver;
        const starting = gameManager.startGame(test_map_1);
        await gameManager.stopGame();
        await starting;
        expect(gameManager.state.gameStatus).toBe(GameStatus.STOPPED);
    });

    it('stopGame issued while the game is stopping resolves only once it has stopped', async () => {
        const { gameManager } = gameDriver;
        await gameManager.startGame(test_map_1);
        const first = gameManager.stopGame();
        await gameManager.stopGame();
        expect(gameManager.state.gameStatus).toBe(GameStatus.STOPPED);
        await first;
    });
});
