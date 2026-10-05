import { Faction, IdleStrategy, SavedGame, Spaceship, Vec2 } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { scoreFrames } from './run-score';
import { scoreSnapshot } from './score';

function snapshot(distance: number, bearing: number, withTarget = true): SavedGame {
    const game = HeadlessGame.start(
        {
            name: 'run_score_spec',
            init: (api) => {
                api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                if (!withTarget) return;
                const at = Vec2.make({
                    x: distance * Math.cos((bearing * Math.PI) / 180),
                    y: distance * Math.sin((bearing * Math.PI) / 180),
                });
                const target = new Spaceship().init('target', at, 'dragonfly-MK1', Faction.Raiders);
                api.addNpcSpaceship(target).state.idleStrategy = IdleStrategy.PLAY_DEAD;
            },
        },
        1,
    );
    game.tick(0.1);
    return game.saveGame();
}

describe('run score', () => {
    const aimed = snapshot(1000, 0);
    const far = snapshot(20_000, 180);
    const alone = snapshot(0, 0, false);
    const valueOf = (saved: SavedGame) => scoreSnapshot(saved, 'GVTS')!.overall.value;
    const helmsOf = (saved: SavedGame) => scoreSnapshot(saved, 'GVTS')!.stations.helms;

    it('is the time-mean of the snapshot scores, each frame standing until the next', () => {
        const frames = [
            { t: 0, saved: far },
            { t: 3, saved: aimed },
        ];
        const score = scoreFrames(frames, { killed: false, seconds: 4, timeoutSeconds: 4, playerId: 'GVTS' })!;
        expect(score.value).toBeCloseTo((3 * valueOf(far) + valueOf(aimed)) / 4, 9);
        expect(score.helms).toBeCloseTo((3 * helmsOf(far) + helmsOf(aimed)) / 4, 9);
        // K_w is read from shot events, never predicted: none recorded, none scored
        expect(score.weapons).toBeNull();
    });

    it('counts the time a kill saved as 1, so an early kill scores above a late one and above none', () => {
        const frames = [
            { t: 0, saved: aimed },
            { t: 1, saved: aimed },
            { t: 2, saved: alone },
        ];
        const run = (killed: boolean, timeoutSeconds: number) =>
            scoreFrames(frames, { killed, seconds: 2, timeoutSeconds, playerId: 'GVTS' })!;
        const early = run(true, 10);
        expect(early.value).toBeCloseTo((2 * valueOf(aimed) + 8) / 10, 9);
        expect(early.value).toBeGreaterThan(run(true, 4).value);
        expect(run(true, 4).value).toBeGreaterThan(run(false, 2).value);
        // station scores are means over the duel only
        expect(early.helms).toBeCloseTo(helmsOf(aimed), 9);
    });

    it('is undefined when no frame holds both ships', () => {
        expect(scoreFrames([{ t: 0, saved: alone }], { killed: false, seconds: 5, timeoutSeconds: 5 })).toBeUndefined();
    });
});
