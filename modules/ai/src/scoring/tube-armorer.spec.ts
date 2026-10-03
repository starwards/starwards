import { HeadlessGame, SERVER_TICK_HZ } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '@starwards/server/src/scenarios/training';

import { tubeArmorer } from './tube-armorer';

describe('tubeArmorer', () => {
    it('launches missiles at the locked enemy from powered tubes, and none without a lock', () => {
        const game = HeadlessGame.start(createTrainingT1Map({ distance: 4000, bearing: 0 }), 1, { crewedPlayer: true });
        const ship = game.shipManagers.get(TRAINING_PLAYER_ID)!.state;
        ship.tubes.forEach((t) => (t.power = 0.5));
        const arm = tubeArmorer(TRAINING_PLAYER_ID);
        const missiles = () =>
            [...game.spaceManager.state.getAll('Projectile')].filter(
                (p) => p.shipId === TRAINING_PLAYER_ID && p.design.homing,
            );
        for (let i = 0; i < 5 * SERVER_TICK_HZ; i++) {
            arm(game);
            game.tick(1 / SERVER_TICK_HZ);
        }
        expect(missiles()).toHaveLength(0);
        ship.weaponsTarget.targetId = TRAINING_TARGET_ID;
        for (let i = 0; i < 20 * SERVER_TICK_HZ && !missiles().length; i++) {
            arm(game);
            game.tick(1 / SERVER_TICK_HZ);
        }
        expect(missiles().length).toBeGreaterThan(0);
        expect(missiles()[0].targetId).toBe(TRAINING_TARGET_ID);
    });
});
