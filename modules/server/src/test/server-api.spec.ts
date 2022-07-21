import { makeDriver } from './driver';

describe('server-API', () => {
    const gameDriver = makeDriver();

    test('start and stop a game (using gameManager API directly)', async () => {
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
        await gameDriver.startGameCommand();
        expect(gameDriver.gameManager.state.isGameRunning).toBe(true);
        await gameDriver.stopGameCommand();
        expect(gameDriver.gameManager.state.isGameRunning).toBe(false);
    });
});
