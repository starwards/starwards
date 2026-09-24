import { ShipManagerNpc, ShipManagerPc } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, training_t0 } from '../scenarios/training';
import { HeadlessGame } from './headless-game';

describe('HeadlessGame.start', () => {
    it('replays a seed identically after another run in the same process', () => {
        const run = () => {
            const game = HeadlessGame.start(training_t0, 1);
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

describe('HeadlessGame.restore', () => {
    it('restores a crewed run with the player ship on the player manager', () => {
        const game = HeadlessGame.start(training_t0, 1, { crewedPlayer: true });
        game.tick(0.1);

        const resumed = HeadlessGame.restore(game.saveGame(), training_t0, 1, game.seconds, { crewedPlayer: true });

        expect(resumed.api.getShip(TRAINING_PLAYER_ID)).toBeInstanceOf(ShipManagerPc);
        expect(resumed.api.getShip(TRAINING_TARGET_ID)).toBeInstanceOf(ShipManagerNpc);
    });
});
