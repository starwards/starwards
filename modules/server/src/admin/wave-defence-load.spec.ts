import { DEFAULT_WAVE_TUNING, createWaveDefenceMap } from '../scenarios/wave-defence';
import { makeDriver } from '../test/driver';
import { mulberry32 } from '@starwards/core/internal';

describe('wave_defence across games', () => {
    const gameDriver = makeDriver();
    const tuning = { ...DEFAULT_WAVE_TUNING, waveIntervalSeconds: 2 };

    it('keeps sending waves in a loaded game', async () => {
        const manager = gameDriver.gameManager;
        await manager.startGame(createWaveDefenceMap(mulberry32(1), tuning));
        const saved = manager.saveGame()!;
        const waves: number[] = [];
        await manager.loadGame(
            saved,
            createWaveDefenceMap(mulberry32(1), tuning, { onWaveSpawned: (n) => waves.push(n) }),
        );
        for (let i = 0; i < 30; i++) manager.update(0.1);
        expect(waves.length).toBeGreaterThan(0);
    });

    it('starts again from the first wave when the same map starts a new game', async () => {
        const manager = gameDriver.gameManager;
        const waves: number[] = [];
        const map = createWaveDefenceMap(mulberry32(1), tuning, { onWaveSpawned: (n) => waves.push(n) });
        await manager.startGame(map);
        for (let i = 0; i < 30; i++) manager.update(0.1);
        await manager.stopGame();
        waves.length = 0;
        await manager.startGame(map);
        expect(waves).toEqual([1]);
    });
});
