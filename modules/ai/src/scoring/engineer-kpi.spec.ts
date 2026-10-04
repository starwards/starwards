import {
    ENGINEER_WEIGHTS,
    EngineerComponents,
    EngineerWeights,
    RiskModel,
    components,
    engineerKpi30,
    engineerKpiSeries,
    needOf,
    observe,
    supply,
} from './engineer-kpi';
import { Faction, IdleStrategy, SavedGame, Spaceship, Vec2 } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';

const w: EngineerWeights = { k: 2, n0: 0.5, beta: 1, lambda0: 0.2, lambda1: 0.4, epsilon: 0.05 };
/** Risk = σ(z) with z set directly by the `threats` feature. */
const direct: RiskModel = { bias: 0, coef: [1, 0, 0, 0, 0] };
const calm = { threats: -50, proximity: 0, blastRate: 0, damage: 0, unscanned: 0 };
const danger = { ...calm, threats: 50 };

const frame = (over: Partial<EngineerComponents> = {}): EngineerComponents => ({
    t: 0,
    sumA: 2,
    service: 1,
    store: 1,
    cells: 0,
    features: calm,
    sumAsev: 0,
    sumSev: 0,
    systems: 10,
    integrity: 1,
    ...over,
});
const k = (over: Partial<EngineerComponents>, weights = w) => engineerKpiSeries([frame(over)], weights, direct)[0];

describe('engineer KPI formula', () => {
    it('earns 0.9 of the reserve for holding the store risk calls for: 0.25 calm, 0.5 at full risk', () => {
        const reserveOnly = { ...ENGINEER_WEIGHTS, lambda0: 0.6, lambda1: 0 };
        const reserveAt = (store: number, features = calm) => k({ service: 0, store, features }, reserveOnly) / 0.6;
        expect(reserveAt(0.25)).toBeCloseTo(0.9, 3);
        expect(reserveAt(0.5, danger)).toBeCloseTo(0.9, 3);
        expect(reserveAt(0.2) - reserveAt(0.04)).toBeGreaterThan(0.4);
    });

    it('measures supply in NORMAL power units, uncapped: overdrive pays through the reserve', () => {
        const at = (power: number) => supply({ broken: false, power, hacked: 1, energyStarved: false });
        expect(at(0.25)).toBeCloseTo(0.5, 9);
        expect(at(0.5)).toBe(1);
        expect(at(1)).toBe(2);
        expect(supply({ broken: false, power: 1, hacked: 1, energyStarved: true })).toBe(0);
    });

    it('needs NORMAL power when nothing is asked and MAX power when fully asked', () => {
        expect(needOf(0)).toBe(1);
        expect(needOf(0.5)).toBeCloseTo(1.5, 9);
        expect(needOf(1)).toBe(2);
        expect(needOf(1, 'reactor')).toBe(1);
    });

    it('blends service and reserve by risk, lambda capped at 0.6', () => {
        const reserve = 1 - Math.exp(-2 / 0.5);
        expect(k({ service: 0.5 })).toBeCloseTo(0.8 * 0.5 + 0.2 * reserve, 6);
        const reserveAtRisk = 1 - Math.exp(-2 / (0.5 * 2));
        expect(k({ service: 0.5, features: danger })).toBeCloseTo(0.4 * 0.5 + 0.6 * reserveAtRisk, 6);
        expect(k({ service: 0.5, features: danger }, { ...w, lambda1: 5 })).toBeCloseTo(
            0.4 * 0.5 + 0.6 * reserveAtRisk,
            6,
        );
    });

    it('charges damage to the frames up to 60 s before it lands', () => {
        const cs = Array.from({ length: 100 }, (_, t) => frame({ t, ...(t >= 50 ? { sumAsev: 2, sumSev: 2 } : {}) }));
        const series = engineerKpiSeries(cs, w, direct);
        expect(series[0]).toBeGreaterThan(series[10]);
        expect(series[10]).toBeLessThan(k({}));
        expect(series[49]).toBeGreaterThan(series[60]);
    });

    it('labels the mean K over the next 30 s, censored when the run ends first', () => {
        const cs = Array.from({ length: 40 }, (_, t) => frame({ t, service: t < 10 ? 1 : 0 }));
        const series = engineerKpiSeries(cs, w, direct);
        const labels = engineerKpi30(cs, w, direct);
        expect(labels[0]).toBeCloseTo(series.slice(1, 31).reduce((s, x) => s + x, 0) / 30, 9);
        expect(labels[10]).toBeNull();
    });
});

describe('engineer KPI from a game', () => {
    function duel(setUp: (game: HeadlessGame) => void = () => undefined) {
        const game = HeadlessGame.start(
            {
                name: 'engineer_kpi_spec',
                init: (api) => {
                    api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                    const target = new Spaceship().init('target', new Vec2(1000, 0), 'dragonfly-MK1', Faction.Raiders);
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
    const of = (saved: SavedGame) => components([observe(0, saved, 'GVTS')!], [], 'GVTS')[0];
    const helmRequesting = (game: HeadlessGame) => {
        game.shipManagers.get('GVTS')!.state.smartPilot.rotation = 1;
    };

    it('keeps the helm demand of a shut-down ship and loses its service', () => {
        const nominal = of(duel(helmRequesting).saveGame());
        const shut = of(
            duel((game) => {
                helmRequesting(game);
                for (const system of game.shipManagers.get('GVTS')!.state.systems()) system.power = 0;
            }).saveGame(),
        );
        expect(shut.sumA).toBeCloseTo(nominal.sumA, 6);
        expect(shut.sumA).toBeGreaterThan(1);
        expect(shut.service).toBeLessThan(nominal.service);
    });

    it('credits max power over normal power where it is asked for', () => {
        const nominal = of(duel(helmRequesting).saveGame());
        const max = of(
            duel((game) => {
                helmRequesting(game);
                for (const system of game.shipManagers.get('GVTS')!.state.systems()) system.power = 1;
            }).saveGame(),
        );
        expect(max.service).toBeGreaterThan(nominal.service);
        expect(max.service).toBeCloseTo(1, 6);
    });

    it('sees a broken reactor as damage', () => {
        const broken = of(
            duel((game) => {
                game.shipManagers.get('GVTS')!.state.reactor.effeciencyFactor = 0;
            }).saveGame(),
        );
        expect(broken.sumAsev).toBeGreaterThanOrEqual(1);
    });
});
