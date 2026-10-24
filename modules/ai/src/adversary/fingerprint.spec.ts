import { FingerprintProbe, RANGE_BIN_EDGES, poolFingerprints, rangeSeparation } from './fingerprint';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { createTrainingT1Map } from '@starwards/server/src/scenarios/training';

const bins = RANGE_BIN_EDGES.length;
const fingerprint = (
    id: string,
    seconds: number,
    bin: number,
    over: Partial<{ hits: number; broken: number }> = {},
) => ({
    id,
    seconds,
    rangeSeconds: RANGE_BIN_EDGES.map((_, i) => (i === bin ? seconds : 0)),
    attentionSwitches: 0,
    hits: over.hits ?? 0,
    hitsOnBrokenPlates: over.broken ?? 0,
    fireSeconds: 0,
    distanceFlown: 0,
});

describe('fingerprint pooling', () => {
    it('shares range time by raider-seconds and sums to one', () => {
        const pooled = poolFingerprints([fingerprint('a', 30, 0), fingerprint('b', 10, 3)]);
        expect(pooled.rangeShare[0]).toBeCloseTo(0.75);
        expect(pooled.rangeShare[3]).toBeCloseTo(0.25);
        expect(pooled.rangeShare.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        expect(pooled.rangeShare).toHaveLength(bins);
    });

    it('takes the broken-plate share over all hits, and is null without any', () => {
        expect(poolFingerprints([fingerprint('a', 1, 0, { hits: 8, broken: 2 })]).brokenPlateShare).toBeCloseTo(0.25);
        expect(poolFingerprints([fingerprint('a', 1, 0)]).brokenPlateShare).toBeNull();
    });

    it('measures separation as total variation', () => {
        const a = poolFingerprints([fingerprint('a', 5, 0)]);
        const b = poolFingerprints([fingerprint('b', 5, 4)]);
        expect(rangeSeparation(a, a)).toBe(0);
        expect(rangeSeparation(a, b)).toBeCloseTo(1);
    });
});

describe('fingerprint probe', () => {
    it('fingerprints the raider of a T1 fight without changing the fight', () => {
        const play = (probe?: FingerprintProbe) => {
            const game = HeadlessGame.start(createTrainingT1Map({ distance: 3000, bearing: 0 }), 1);
            while (game.seconds < 40) {
                probe?.script(game);
                game.tick(1 / 20);
            }
            return game.api.getShip('GVTS')?.state.healthRatio;
        };
        const probe = new FingerprintProbe();
        const watched = play(probe);
        expect(watched).toBe(play());

        const [raider, ...others] = probe.result();
        expect(others).toHaveLength(0);
        expect(raider.id).toBe('target');
        expect(raider.seconds).toBeGreaterThan(30);
        expect(raider.rangeSeconds.reduce((a, b) => a + b, 0)).toBeCloseTo(raider.seconds);
        expect(raider.fireSeconds).toBeGreaterThan(0);
        expect(raider.distanceFlown).toBeGreaterThan(0);
    });
});
