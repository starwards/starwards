import { Asteroid, SpaceObject, Vec2 } from '@starwards/core/internal';

import { makeDriver } from './driver';

describe('GameManager.saveGame', () => {
    const gameDriver = makeDriver({ manualClock: true });

    it('takes a snapshot without changing the live game', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const { spaceManager } = gameDriver.gameManager;
        spaceManager.insert(new Asteroid().init('pending-asteroid', new Vec2(0, 0), 10));
        const ids = (objects: Iterable<SpaceObject>) => [...objects].map((o) => o.id);
        const live = ids(spaceManager.state);

        const saved = gameDriver.gameManager.saveGame()!;

        expect(ids(spaceManager.state)).toEqual(live);
        expect(ids(saved.fragment.space)).toEqual(expect.arrayContaining([...live, 'pending-asteroid']));
    });
});
