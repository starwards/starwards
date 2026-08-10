import { Asteroid, GameStatus, Vec2 } from '@starwards/core/internal';

import { SavedGame } from '../serialization/game-state-protocol';
import { makeDriver } from './driver';
import supertest from 'supertest';

describe('GameManager replay hooks (issue #2101)', () => {
    const gameDriver = makeDriver();

    it('exposes totalSeconds publicly', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        gameDriver.gameManager.update(1 / 20);
        expect(gameDriver.gameManager.totalSeconds).toBeGreaterThan(0);
    });

    it('calls replayTick with totalSeconds instead of running the sim block, while in REPLAY status', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        const shipId = gameDriver.gameManager.state.playerShipIds[0];
        const before = gameDriver.spaceManager.state.getShip(shipId)!.position.x;
        gameDriver.spaceManager.state.getShip(shipId)!.velocity.x = 1000; // would move if sim ran

        gameDriver.gameManager.state.gameStatus = GameStatus.REPLAY;
        const calls: number[] = [];
        gameDriver.gameManager.replayTick = (totalSeconds: number) => calls.push(totalSeconds);

        gameDriver.gameManager.update(1 / 20);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toBeGreaterThan(0);
        // sim block did not run: position unchanged despite nonzero velocity
        expect(gameDriver.spaceManager.state.getShip(shipId)!.position.x).toBe(before);
    });

    it('leaves destroyed objects out of a snapshot, along with the bridge of a destroyed ship', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        const asteroid = new Asteroid().init('doomed-rock', Vec2.make({ x: 100, y: 100 }), 50);
        gameDriver.spaceManager.insert(asteroid);
        gameDriver.spaceManager.forceFlushEntities();
        const shipId = gameDriver.gameManager.state.shipIds[0];

        expect(gameDriver.gameManager.saveGame()!.fragment.space.get(asteroid.id)).toBeDefined();

        // flagged, but SpaceManager's GC has not run yet — the state still holds both
        asteroid.destroyed = true;
        gameDriver.spaceManager.state.getShip(shipId)!.destroyed = true;

        const saved = gameDriver.gameManager.saveGame()!;
        expect(saved.fragment.space.get(asteroid.id)).toBeUndefined();
        expect(saved.fragment.space.getShip(shipId)).toBeUndefined();
        expect(saved.fragment.ship.has(shipId)).toBe(false);
    });

    it('stopGame() tears a REPLAY down to STOPPED', async () => {
        await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
        gameDriver.gameManager.state.gameStatus = GameStatus.REPLAY;
        await gameDriver.gameManager.stopGame();
        expect(gameDriver.gameManager.state.gameStatus).toBe(GameStatus.STOPPED);
    });

    describe('applyReplayFrame', () => {
        it('reconciles space objects: updates existing, inserts new, deletes missing', async () => {
            await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
            gameDriver.gameManager.update(0);
            const frame = gameDriver.gameManager.saveGame() as SavedGame;
            const keptAsteroidId = [...frame.fragment.space.getAll('Asteroid')][0].id;
            const removedAsteroidId = [...frame.fragment.space.getAll('Asteroid')][1].id;

            // mutate the frame: move the kept asteroid, delete another, add a brand new one
            frame.fragment.space.get(keptAsteroidId)!.position.x = 12345;
            frame.fragment.space.delete(frame.fragment.space.get(removedAsteroidId)!);
            const newAsteroid = new Asteroid().init('brand-new-astro', new Vec2(1, 2));
            frame.fragment.space.set(newAsteroid);

            gameDriver.gameManager.state.gameStatus = GameStatus.REPLAY;
            gameDriver.gameManager.applyReplayFrame(frame);

            expect(gameDriver.spaceManager.state.get(keptAsteroidId)?.position.x).toBe(12345);
            expect(gameDriver.spaceManager.state.get(removedAsteroidId)).toBeUndefined();
            expect(gameDriver.spaceManager.state.get('brand-new-astro')).toBeDefined();
        });

        it('deep-assigns ship subsystem state for a ship present in both the live game and the frame', async () => {
            await supertest(gameDriver.httpServer).post('/start-game').send({ mapName: 'test_map_1' }).expect(200);
            gameDriver.gameManager.update(0);
            const shipId = gameDriver.gameManager.state.playerShipIds[0];
            const frame = gameDriver.gameManager.saveGame() as SavedGame;
            frame.fragment.ship.get(shipId)!.design.totalCoolant = 42;

            gameDriver.gameManager.state.gameStatus = GameStatus.REPLAY;
            gameDriver.gameManager.applyReplayFrame(frame);

            expect(gameDriver.getShip(shipId).state.design.totalCoolant).toBe(42);
        });
    });
});
