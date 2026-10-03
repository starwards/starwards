import { HeadlessGame, SERVER_TICK_HZ } from '@starwards/server/src/test/headless-game';
import { LAUNCH_INTERVAL_SECONDS, tubeArmorer } from './tube-armorer';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '@starwards/server/src/scenarios/training';

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

    it('staggers launches, and unloads the tubes once the magazine holds no missile', () => {
        const game = HeadlessGame.start(createTrainingT1Map({ distance: 4000, bearing: 0 }), 1, { crewedPlayer: true });
        const ship = game.shipManagers.get(TRAINING_PLAYER_ID)!.state;
        ship.tubes.forEach((t) => (t.power = 0.5));
        ship.weaponsTarget.targetId = TRAINING_TARGET_ID;
        const arm = tubeArmorer(TRAINING_PLAYER_ID);
        const launches: number[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < 40 * SERVER_TICK_HZ; i++) {
            arm(game);
            game.tick(1 / SERVER_TICK_HZ);
            for (const p of game.spaceManager.state.getAll('Projectile')) {
                if (p.shipId === TRAINING_PLAYER_ID && p.design.homing && !seen.has(p.id)) {
                    seen.add(p.id);
                    launches.push(game.seconds);
                }
            }
        }
        expect(launches.length).toBeGreaterThan(1);
        launches
            .slice(1)
            .forEach((t, i) => expect(t - launches[i]).toBeGreaterThanOrEqual(LAUNCH_INTERVAL_SECONDS - 0.1));
        for (const m of [
            'HiExpMissile',
            'ArmPenMissile',
            'FragMissile',
            'ClusterMissile',
            'TandemMissile',
            'ElecMissile',
        ] as const)
            ship.magazine.setCount(m, 0);
        ship.tubes.forEach((t) => {
            t.loading = 0;
            t.loadedProjectile = 'None';
        });
        arm(game);
        expect(ship.tubes.every((t) => t.projectile === 'None')).toBe(true);
    });
});
