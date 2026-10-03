import {
    EngineerComponents,
    EngineerWeights,
    components,
    engineerKpi,
    engineerKpi30,
    observe,
    riskOf,
} from './engineer-kpi';
import { Faction, IdleStrategy, SavedGame, Spaceship, Vec2 } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';

const w: EngineerWeights = { k: 2, n0: 0.5, beta: 1, lambda0: 0.2, lambda1: 0.4, epsilon: 0.05 };

const frame = (over: Partial<EngineerComponents> = {}): EngineerComponents => ({
    t: 0,
    sumA: 2,
    service: 1,
    store: 1,
    risk: 0,
    sumAsev: 0,
    sumSev: 0,
    systems: 10,
    ...over,
});

describe('engineer KPI formula', () => {
    it('blends service and reserve by risk, lambda capped at 0.6', () => {
        const reserve = 1 - Math.exp(-2 / 0.5);
        expect(engineerKpi(frame({ service: 0.5 }), w)).toBeCloseTo(0.8 * 0.5 + 0.2 * reserve, 9);
        const reserveAtRisk = 1 - Math.exp(-2 / (0.5 * 2));
        expect(engineerKpi(frame({ service: 0.5, risk: 1 }), w)).toBeCloseTo(0.4 * 0.5 + 0.6 * reserveAtRisk, 9);
        expect(engineerKpi(frame({ service: 0.5, risk: 1 }), { ...w, lambda1: 5 })).toBeCloseTo(
            0.4 * 0.5 + 0.6 * reserveAtRisk,
            9,
        );
    });

    it('scores reserve alone when nothing is demanded', () => {
        expect(engineerKpi(frame({ sumA: 0.05, service: 0 }), w)).toBeCloseTo(1 - Math.exp(-4), 9);
    });

    it('scales by demand-weighted integrity', () => {
        const intact = engineerKpi(frame(), w);
        const damaged = engineerKpi(frame({ sumAsev: 1, sumSev: 1 }), w);
        expect(damaged).toBeCloseTo(intact * (1 - (1 + 0.05) / (2 + 0.5)), 9);
    });

    it('drops with a draining store and grows with an energy cell', () => {
        expect(engineerKpi(frame({ store: 0 }), w)).toBeLessThan(engineerKpi(frame({ store: 0.3 }), w));
    });

    it('labels the mean K over the next 30 s, censored when the run ends first', () => {
        const cs = Array.from({ length: 40 }, (_, t) => frame({ t, service: t < 10 ? 1 : 0 }));
        const k1 = engineerKpi(frame({ service: 1 }), w);
        const k0 = engineerKpi(frame({ service: 0 }), w);
        expect(engineerKpi30(cs, 0, w)).toBeCloseTo((9 * k1 + 21 * k0) / 30, 9);
        expect(engineerKpi30(cs, 10, w)).toBeNull();
    });

    it('raises risk with hostiles near, blasts and lost integrity', () => {
        const calm = riskOf({ threats: 0, proximity: 0, damage: 0, unscanned: 0 }, 0);
        expect(calm).toBeLessThan(0.1);
        expect(riskOf({ threats: 1, proximity: 1, damage: 0.3, unscanned: 0 }, 0.5)).toBeGreaterThan(0.9);
    });
});

describe('engineer KPI from a game', () => {
    function duel(distance: number, setUp: (game: HeadlessGame) => void = () => undefined) {
        const game = HeadlessGame.start(
            {
                name: 'engineer_kpi_spec',
                init: (api) => {
                    api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                    const target = new Spaceship().init(
                        'target',
                        new Vec2(distance, 0),
                        'dragonfly-MK1',
                        Faction.Raiders,
                    );
                    api.addNpcSpaceship(target).state.idleStrategy = IdleStrategy.PLAY_DEAD;
                },
            },
            1,
            { crewedPlayer: true },
        );
        setUp(game);
        game.tick(0.1);
        return game;
    }
    const kpiOf = (saved: SavedGame) => {
        const o = observe(0, saved, 'GVTS')!;
        return { o, c: components([o], [], 'GVTS')[0] };
    };

    it('sees a near hostile as risk and the reactor as always demanded', () => {
        const near = kpiOf(duel(1000).saveGame());
        const far = kpiOf(duel(60_000).saveGame());
        expect(near.c.risk).toBeGreaterThan(far.c.risk);
        expect(near.c.sumA).toBeGreaterThanOrEqual(1);
        expect(near.o.systems.some((s) => s.kind === 'reactor')).toBe(true);
    });

    it('loses service when the demanded systems are shut down, and integrity when broken', () => {
        const nominal = kpiOf(duel(1000).saveGame()).c;
        const shut = kpiOf(
            duel(1000, (game) => {
                const state = game.shipManagers.get('GVTS')!.state;
                for (const system of state.systems()) system.power = 0;
            }).saveGame(),
        ).c;
        expect(shut.service).toBeLessThan(nominal.service);
        expect(engineerKpi(shut)).toBeLessThan(engineerKpi(nominal));
        const broken = kpiOf(
            duel(1000, (game) => {
                game.shipManagers.get('GVTS')!.state.reactor.effeciencyFactor = 0;
            }).saveGame(),
        ).c;
        expect(broken.sumAsev).toBeGreaterThanOrEqual(1);
    });
});
