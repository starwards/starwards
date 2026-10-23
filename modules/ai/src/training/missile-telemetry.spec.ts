import { Projectile, Vec2 } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '@starwards/server/src/scenarios/training';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { missileTelemetry } from './missile-telemetry';

function launch(game: HeadlessGame, secondsToLive?: number) {
    const missile = new Projectile('HiExpMissile');
    missile.init('test-missile', new Vec2(0, 0));
    missile.shipId = TRAINING_PLAYER_ID;
    missile.targetId = TRAINING_TARGET_ID;
    missile.secondsToLive = secondsToLive ?? missile.design.homing!.secondsToLive;
    game.spaceManager.insert(missile);
    return missile.targetId;
}

function play(distance: number, secondsToLive?: number) {
    const game = HeadlessGame.start(createTrainingT1Map({ distance, bearing: 0 }), 1, { crewedPlayer: true });
    const telemetry = missileTelemetry();
    telemetry.tick(game);
    const targetId = launch(game, secondsToLive);
    while (game.seconds < 60) {
        game.tick(0.1);
        telemetry.tick(game);
    }
    return { targetId, launches: telemetry.report() };
}

describe('missile telemetry', () => {
    test('logs a launch with its target, the target model, the range and the hit', () => {
        const { targetId, launches } = play(4000);
        expect(launches).toHaveLength(1);
        const [l] = launches;
        expect(l.targetId).toBe(targetId);
        expect(l.targetModel).toBe('dragonfly-MK1');
        expect(l.missile).toBe('HiExpMissile');
        expect(l.range).toBeGreaterThan(3500);
        expect(l.range).toBeLessThan(4500);
        expect(l.envelopeFraction).toBeCloseTo((l.range ?? NaN) / (600 * 78), 2);
        expect(l.underShellfire).toBe(false);
        expect(['hit', 'kill']).toContain(l.outcome);
    });

    test('a missile that burns out short of its target expired', () => {
        const { launches } = play(30_000, 3);
        expect(launches.map((l) => l.outcome)).toEqual(['expired']);
    });
});
