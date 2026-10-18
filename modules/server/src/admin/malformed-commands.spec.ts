import { Faction } from '@starwards/core/internal';

import { makeDriver } from '../test/driver';
import { two_vs_one } from '../maps';

describe('a malformed queued command', () => {
    const gameDriver = makeDriver();

    beforeEach(async () => {
        await gameDriver.gameManager.startGame(two_vs_one);
    });

    it('is dropped without costing the tick the space commands after it', () => {
        const manager = gameDriver.gameManager;
        const space = manager.spaceManager.state;
        const asteroids = () => [...space.getAll('Asteroid')].length;
        const shipsBefore = gameDriver.shipManagers.size;
        const asteroidsBefore = asteroids();
        space.createAsteroidCommands.push(null as never, { position: { x: 0, y: 0 }, radius: 10 });
        space.moveCommands.push(null as never);
        space.botOrderCommands.push(null as never);
        space.setScanLevelCommands.push(null as never);
        space.lockCommands.push(null as never);
        space.createSpaceshipCommands.push(null as never, {
            position: { x: 1000, y: 1000 },
            isPlayerShip: false,
            shipModel: 'dragonfly-MK1',
            faction: Faction.NONE,
        });
        const before = manager.totalSeconds;
        manager.update(0.1);
        expect(asteroids()).toBe(asteroidsBefore + 1);
        expect(gameDriver.shipManagers.size).toBe(shipsBefore + 1);
        expect(manager.totalSeconds).toBeGreaterThan(before);
        expect(space.createAsteroidCommands).toEqual([]);
        expect(space.createSpaceshipCommands).toEqual([]);
    });
});
