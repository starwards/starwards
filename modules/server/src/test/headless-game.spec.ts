import { ShipManagerNpc, ShipManagerPc } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, training_t0 } from '../scenarios/training';
import { HeadlessGame } from './headless-game';

describe('HeadlessGame.restore', () => {
    it('restores a crewed run with the player ship on the player manager', () => {
        const game = HeadlessGame.start(training_t0, 1, { crewedPlayer: true });
        game.tick(0.1);

        const resumed = HeadlessGame.restore(game.saveGame(), training_t0, 1, game.seconds, { crewedPlayer: true });

        expect(resumed.api.getShip(TRAINING_PLAYER_ID)).toBeInstanceOf(ShipManagerPc);
        expect(resumed.api.getShip(TRAINING_TARGET_ID)).toBeInstanceOf(ShipManagerNpc);
    });
});
