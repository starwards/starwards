import { Faction, IdleStrategy, Spaceship, Vec2 } from '@starwards/core/internal';
import { evaluate, featureSelector } from './model';
import { scoreSnapshot, scorers } from './score';

import { FEATURE_NAMES } from './features';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';

describe('snapshot scorer', () => {
    it.each(Object.values(scorers))(
        '$version matches the Python predictions on its exported fixture within 1e-6',
        (scorer) => {
            for (const [label, expected] of Object.entries(scorer.fixture.predictions)) {
                scorer.fixture.features.forEach((x, i) => {
                    expect(Math.abs(evaluate(scorer.models[label], x) - expected[i])).toBeLessThan(1e-6);
                });
            }
        },
    );

    it('reads an earlier artefact by feature name after features were added', () => {
        const x = FEATURE_NAMES.map((_, i) => i);
        const v1 = featureSelector(scorers.v1, FEATURE_NAMES)(x);
        expect(v1).toEqual(scorers.v1.features.map((f) => FEATURE_NAMES.indexOf(f)));
        expect(() => featureSelector({ ...scorers.v1, features: ['no_such_feature'] }, FEATURE_NAMES)).toThrow();
    });

    function duelAt(distance: number, bearing: number) {
        const game = HeadlessGame.start(
            {
                name: 'score_spec',
                init: (api) => {
                    api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                    const target = new Spaceship().init(
                        'target',
                        Vec2.make({
                            x: distance * Math.cos((bearing * Math.PI) / 180),
                            y: distance * Math.sin((bearing * Math.PI) / 180),
                        }),
                        'dragonfly-MK1',
                        Faction.Raiders,
                    );
                    api.addNpcSpaceship(target).state.idleStrategy = IdleStrategy.PLAY_DEAD;
                },
            },
            1,
        );
        game.tick(0.1);
        return game.saveGame();
    }

    it('scores a live snapshot in [0, 1] and prefers firing position for helms', () => {
        const aimed = scoreSnapshot(duelAt(1000, 0), 'GVTS');
        const far = scoreSnapshot(duelAt(20_000, 180), 'GVTS');
        expect(aimed && far).toBeTruthy();
        for (const v of [
            ...Object.values(aimed!.overall),
            ...Object.values(aimed!.tactical),
            ...Object.values(aimed!.stations),
        ]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
        expect(aimed!.stations.helms).toBeGreaterThan(far!.stations.helms);
    });
});
