import { HeadlessGame, SERVER_TICK_HZ } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '@starwards/server/src/scenarios/training';

import { captain } from './captain';
import { createTrainingWeaponsMultiMap } from '@starwards/server/src/scenarios/training-weapons';

describe('captain', () => {
    it('re-designates the threat as weapons target whenever the lock is lost or moved', () => {
        const game = HeadlessGame.start(
            createTrainingWeaponsMultiMap({ distance: 5000, bearing: 0, decoyDistance: 4000, decoyOffset: 60 }),
            1,
            { crewedPlayer: true },
        );
        const ship = game.shipManagers.get(TRAINING_PLAYER_ID)!.state;
        const command = captain(TRAINING_PLAYER_ID, TRAINING_TARGET_ID);
        ship.weaponsTarget.targetId = null;
        for (let i = 0; i < 2 * SERVER_TICK_HZ; i++) {
            command(game);
            game.tick(1 / SERVER_TICK_HZ);
        }
        expect(ship.weaponsTarget.targetId).toBe(TRAINING_TARGET_ID);
        ship.weaponsTarget.targetId = 'decoy';
        for (let i = 0; i < 2 * SERVER_TICK_HZ; i++) {
            command(game);
            game.tick(1 / SERVER_TICK_HZ);
        }
        expect(ship.weaponsTarget.targetId).toBe(TRAINING_TARGET_ID);
    });
});
