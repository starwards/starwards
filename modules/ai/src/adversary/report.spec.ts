import {
    AdversaryBaseline,
    AdversaryRun,
    adversaryMarkdown,
    storedBinEdges,
    summariseProfiles,
    wilson,
} from './report';
import { RANGE_BIN_EDGES } from './fingerprint';

const run = (profile: string, seed: number, killed: boolean, bin: number): AdversaryRun => ({
    profile,
    seed,
    killed,
    kills: Number(killed),
    enemies: 1,
    seconds: killed ? 60 + seed : 180,
    value: killed ? 0.8 : 0.3,
    fingerprints: [
        {
            id: 'target',
            seconds: 10,
            rangeSeconds: RANGE_BIN_EDGES.map((_, i) => (i === bin ? 10 : 0)),
            attentionSwitches: 1,
            hits: 4,
            hitsOnBrokenPlates: 1,
            fireSeconds: 5,
            distanceFlown: 1000,
        },
    ],
});

describe('wilson interval', () => {
    it('brackets the rate and stays inside 0..1', () => {
        const [low, high] = wilson(12, 16);
        expect(low).toBeLessThan(0.75);
        expect(high).toBeGreaterThan(0.75);
        expect(wilson(0, 8)[0]).toBe(0);
        expect(wilson(8, 8)[1]).toBe(1);
        expect(wilson(0, 0)).toEqual([0, 1]);
    });
});

describe('adversary summary', () => {
    const runs = [
        run('today', 1, true, 2),
        run('today', 2, false, 2),
        run('shadow', 1, true, 4),
        run('shadow', 2, true, 4),
    ];

    it('pools each profile over its seeds', () => {
        const [today, shadow] = summariseProfiles(runs);
        expect(today).toMatchObject({ profile: 'today', runs: 2, passes: 1, passRate: 0.5 });
        expect(shadow).toMatchObject({ profile: 'shadow', runs: 2, passes: 2 });
        expect(today.fingerprint.raiders).toBe(2);
        expect(today.fingerprint.brokenPlateShare).toBeCloseTo(0.25);
    });

    it('renders every profile in the pass table and the separation matrix', () => {
        const baseline: AdversaryBaseline = {
            rung: 'A1',
            crew: 'reference',
            firstSeed: 1,
            seeds: 2,
            timeoutSeconds: 180,
            rangeBinEdges: storedBinEdges,
            profiles: summariseProfiles(runs),
        };
        const markdown = adversaryMarkdown(baseline);
        expect(markdown).toContain('| today | 2 | 1 | 50% |');
        expect(markdown).toContain('| shadow | 2 | 2 | 100% |');
        expect(markdown).toContain('| today | . | 1.00 |');
        expect(JSON.parse(JSON.stringify(baseline))).toEqual(baseline);
    });
});
