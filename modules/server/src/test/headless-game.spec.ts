import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { SavedGame, ShipManagerNpc, ShipManagerPc, makeId, mulberry32, uniqueId } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, training_t1 } from '../scenarios/training';
import { createWaveDefenceMap } from '../scenarios/wave-defence';

describe('HeadlessGame.start', () => {
    it('replays a seed identically after another run in the same process', () => {
        const run = () => {
            const game = HeadlessGame.start(training_t1, 1);
            while (game.seconds < 30) {
                game.tick(1 / 60);
            }
            return (['Projectile', 'Explosion'] as const)
                .flatMap((type) => [...game.spaceManager.state.getAll(type)])
                .map((o) => `${o.id}@${o.position.x.toFixed(3)},${o.position.y.toFixed(3)}`)
                .join(' ');
        };
        const first = run();
        expect(first).not.toBe('');
        expect(run()).toBe(first);
    });
});

describe('HeadlessGame.stopped', () => {
    it('reads false while the game runs and true once the map pauses it, as wave-defence does on defeat', () => {
        let pause = () => undefined as void;
        const game = HeadlessGame.start(
            {
                name: 'pausing-map',
                init: (api) => {
                    pause = () => api.setSpeed(0);
                },
            },
            1,
        );
        game.tick(1);
        expect(game.stopped).toBe(false);

        pause();
        game.tick(1);
        expect(game.stopped).toBe(true);
        expect(game.seconds).toBe(1);
    });
});

describe('HeadlessGame.restore', () => {
    it('restores a crewed run with the player ship on the player manager', () => {
        const game = HeadlessGame.start(training_t1, 1, { crewedPlayer: true });
        game.tick(0.1);

        const resumed = HeadlessGame.restore(game.saveGame(), training_t1, 1, game.seconds, { crewedPlayer: true });

        expect(resumed.api.getShip(TRAINING_PLAYER_ID)).toBeInstanceOf(ShipManagerPc);
        expect(resumed.api.getShip(TRAINING_TARGET_ID)).toBeInstanceOf(ShipManagerNpc);
    });

    it('resumes a live explosion straight from saveGame, without a serialize round-trip', () => {
        const game = HeadlessGame.start(training_t1, 1);
        // snapshot the tick before a live blast first lands on a hull
        let saved: SavedGame | undefined;
        let savedSeconds = 0;
        for (let i = 0; i < 60 * SERVER_TICK_HZ && !saved; i++) {
            const unhit = [...game.spaceManager.state.getAll('Explosion')].filter((e) => e.hitObjectIds.size === 0);
            const before = unhit.length ? game.saveGame() : undefined;
            const beforeSeconds = game.seconds;
            game.tick(1 / SERVER_TICK_HZ);
            if (unhit.some((e) => e.hitObjectIds.size > 0)) {
                saved = before;
                savedSeconds = beforeSeconds;
            }
        }
        if (!saved) {
            throw new Error('no blast hit a hull within a minute');
        }

        const resumed = HeadlessGame.restore(saved, training_t1, 1, savedSeconds);

        expect(() => resumed.tick(1 / SERVER_TICK_HZ)).not.toThrow();
    });

    it('issues new ids past every id in the snapshot, even after another run reset the sequence', () => {
        const map = createWaveDefenceMap(mulberry32(1));
        const game = HeadlessGame.start(map, 1);
        game.tick(1);
        const saved = game.saveGame();
        HeadlessGame.start(training_t1, 2);

        const resumed = HeadlessGame.restore(saved, map, 1, game.seconds);

        const restoredIds = new Set([...resumed.spaceManager.state].map((o) => o.id));
        for (const id of [makeId(), uniqueId('shell'), uniqueId('explosion')]) {
            expect(restoredIds.has(id)).toBe(false);
        }
    });
});
