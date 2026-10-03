import { CELLS, Mover, bandOfSeconds, bandRadii, cellOf, sectorOf, timeToReach } from './grid';
import { Faction, IdleStrategy, Spaceship, Vec2 } from '@starwards/core/internal';
import { TARGETS, describeHeatmap, heatmapAt, heatmapModel, predictTarget } from './heatmap';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';

const still: Mover = {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    angle: 0,
    turnSpeed: 0,
    capacity: { fwd: 100, aft: 50, port: 50, stbd: 50 },
    rotationCapacity: 90,
    maxTurnSpeed: 90,
    maxSpeed: 500,
};

describe('isochrone grid', () => {
    it('times a point dead ahead as full forward thrust to top speed', () => {
        // 1250 m: accelerate 5 s at 100 m/s² reaches 500 m/s after 1250 m
        expect(timeToReach(still, { x: 1250, y: 0 })).toBeCloseTo(5, 1);
        // past top speed: 1250 m + 500 m/s × 2 s
        expect(timeToReach(still, { x: 2250, y: 0 })).toBeCloseTo(7, 1);
    });

    it('reaches ahead sooner than astern, and drift carries the ship toward points ahead', () => {
        expect(timeToReach(still, { x: -1250, y: 0 })).toBeGreaterThan(timeToReach(still, { x: 1250, y: 0 }));
        const drifting = { ...still, velocity: { x: 300, y: 0 } };
        expect(timeToReach(drifting, { x: 1250, y: 0 })).toBeLessThan(timeToReach(still, { x: 1250, y: 0 }));
        expect(timeToReach(drifting, { x: -1250, y: 0 })).toBeGreaterThan(timeToReach(still, { x: -1250, y: 0 }));
        const radii = bandRadii(still);
        expect(radii[0][0]).toBeGreaterThan(radii[4][0]);
    });

    it('numbers sectors clockwise from the nose and bands by time', () => {
        expect(sectorOf(still, { x: 1000, y: 0 })).toBe(0);
        expect(sectorOf(still, { x: 0, y: 1000 })).toBe(2);
        expect(sectorOf(still, { x: -1000, y: 0 })).toBe(4);
        expect(sectorOf(still, { x: 0, y: -1000 })).toBe(6);
        expect([0, 4.9, 5, 14.9, 15, 39, 40, 100].map(bandOfSeconds)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
        expect(cellOf(still, { x: 100_000, y: 0 }).band).toBe(3);
    });
});

describe('heatmap', () => {
    it('matches the Python predictions on the exported fixture within 1e-6', () => {
        for (const target of TARGETS) {
            const fx = heatmapModel.fixture[target] as {
                frame: number[][];
                cells?: number[][][];
                cell?: number[];
                position?: number[][];
                current?: number[];
                closing: number[];
                aspect: number[];
                predictions: number[][] | number[];
            };
            fx.frame.forEach((frame, r) => {
                const common = { frame, closing: fx.closing[r], aspect: fx.aspect[r], current: fx.current?.[r] ?? 0 };
                if (fx.cells) {
                    const got = predictTarget(heatmapModel.targets[target], { ...common, cells: fx.cells[r] });
                    (fx.predictions[r] as number[]).forEach((p, c) => expect(Math.abs(got[c] - p)).toBeLessThan(1e-6));
                } else {
                    const cells = Array.from({ length: CELLS }, () => fx.position![r]);
                    const got = predictTarget(heatmapModel.targets[target], { ...common, cells })[fx.cell![r]];
                    expect(Math.abs(got - (fx.predictions[r] as number))).toBeLessThan(1e-6);
                }
            });
        }
    });

    function duelAt(x: number, y: number) {
        const game = HeadlessGame.start(
            {
                name: 'heatmap_spec',
                init: (api) => {
                    api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                    const target = new Spaceship().init('target', new Vec2(x, y), 'dragonfly-MK1', Faction.Raiders);
                    api.addNpcSpaceship(target).state.idleStrategy = IdleStrategy.PLAY_DEAD;
                },
            },
            1,
        );
        game.tick(0.1);
        return game.saveGame();
    }

    it('maps a still target ahead to the cells ahead, sums threat to 1, and reads it out', () => {
        const map = heatmapAt(duelAt(2000, 0), 'GVTS')!;
        expect(map.cells).toHaveLength(CELLS);
        const sum = map.cells.reduce((s, c) => s + c.threat10, 0);
        expect(sum).toBeCloseTo(1, 6);
        const ahead = map.cells.filter((c) => c.sector === 0 || c.sector === 1 || c.sector === 7);
        expect(ahead.reduce((s, c) => s + c.threat10, 0)).toBeGreaterThan(0.5);
        for (const c of map.cells) {
            for (const v of [c.fire, c.danger, c.value]) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        }
        expect(describeHeatmap(map)).toMatch(
            /^enemy in 10 s likely (ahead|ahead-right|ahead-left) .*; best firing cell: .*; most dangerous: /,
        );
    });
});
