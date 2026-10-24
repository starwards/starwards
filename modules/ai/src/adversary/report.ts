import {
    PooledFingerprint,
    RANGE_BIN_EDGES,
    RaiderFingerprint,
    poolFingerprints,
    rangeSeparation,
} from './fingerprint';

import { median } from '@starwards/server/src/test/training/gunnery-metrics';

/** One adversary run: the fixed crew's outcome against one NPC profile, and what the raiders did. */
export interface AdversaryRun {
    readonly profile: string;
    readonly seed: number;
    readonly killed: boolean;
    readonly kills: number;
    readonly enemies: number;
    readonly seconds: number;
    /** The crew's run value; null when the run had no scored frame. */
    readonly value: number | null;
    /** A wave rung's progress; absent on a single-raider rung. */
    readonly waves?: { readonly survived: number; readonly stationsLost: number };
    readonly fingerprints: readonly RaiderFingerprint[];
}

/** One NPC profile over every seed it was played: the crew's pass rate and the raiders' pooled behaviour. */
export interface ProfileSummary {
    readonly profile: string;
    readonly runs: number;
    readonly passes: number;
    readonly passRate: number;
    /** Wilson 95% interval of the pass rate. */
    readonly passRateCi: readonly [number, number];
    readonly medianSeconds: number;
    readonly meanValue: number | null;
    readonly meanWavesSurvived: number | null;
    readonly fingerprint: PooledFingerprint;
}

/** Wilson score interval for `passes` of `runs`. */
export function wilson(passes: number, runs: number, z = 1.96): readonly [number, number] {
    if (!runs) {
        return [0, 1];
    }
    const p = passes / runs;
    const denominator = 1 + z ** 2 / runs;
    const centre = (p + z ** 2 / (2 * runs)) / denominator;
    const half = (z * Math.sqrt((p * (1 - p)) / runs + z ** 2 / (4 * runs ** 2))) / denominator;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summariseProfiles(runs: readonly AdversaryRun[]): ProfileSummary[] {
    const profiles = [...new Set(runs.map((r) => r.profile))];
    return profiles.map((profile) => {
        const own = runs.filter((r) => r.profile === profile);
        const passes = own.filter((r) => r.killed).length;
        return {
            profile,
            runs: own.length,
            passes,
            passRate: passes / own.length,
            passRateCi: wilson(passes, own.length),
            medianSeconds: median(own.map((r) => r.seconds)),
            meanValue: mean(own.flatMap((r) => (r.value === null ? [] : [r.value]))),
            meanWavesSurvived: mean(own.flatMap((r) => (r.waves ? [r.waves.survived] : []))),
            fingerprint: poolFingerprints(own.flatMap((r) => r.fingerprints)),
        };
    });
}

/** Profiles whose range histograms differ by less than this total variation are not told apart by range. */
const RANGE_SEPARATION_FLOOR = 0.1;

/** A committed baseline: what one rung's profiles measured, on named seeds against a named crew. */
export interface AdversaryBaseline {
    readonly rung: string;
    readonly crew: string;
    readonly firstSeed: number;
    readonly seeds: number;
    readonly timeoutSeconds: number;
    readonly rangeBinEdges: readonly (number | null)[];
    readonly profiles: readonly ProfileSummary[];
}

/** `Infinity` does not survive JSON; the last bin edge is stored as null. */
export const storedBinEdges = RANGE_BIN_EDGES.map((edge) => (Number.isFinite(edge) ? edge : null));

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const fixed = (x: number | null, digits = 2) => (x === null || !Number.isFinite(x) ? '-' : x.toFixed(digits));

function binLabel(bin: number): string {
    const low = bin === 0 ? 0 : RANGE_BIN_EDGES[bin - 1];
    const high = RANGE_BIN_EDGES[bin];
    return Number.isFinite(high) ? `${low / 1000}-${high / 1000}` : `${low / 1000}+`;
}

/** The markdown of an adversary rung: pass rates, fingerprints, and which profiles range apart. */
export function adversaryMarkdown(baseline: AdversaryBaseline): string {
    const { profiles } = baseline;
    const lines = [
        `# Adversary rung ${baseline.rung}`,
        '',
        `Crew \`${baseline.crew}\` fixed; only the raider varies. Seeds ${baseline.firstSeed}-${baseline.firstSeed + baseline.seeds - 1}, timeout ${baseline.timeoutSeconds} s.`,
        '',
        '## Crew outcome by NPC profile',
        '',
        '| profile | runs | passes | pass rate | 95% CI | median s | mean run value | mean waves survived |',
        '|---|---|---|---|---|---|---|---|',
        ...profiles.map(
            (p) =>
                `| ${p.profile} | ${p.runs} | ${p.passes} | ${pct(p.passRate)} | ${pct(p.passRateCi[0])}-${pct(p.passRateCi[1])} | ${fixed(p.medianSeconds, 0)} | ${fixed(p.meanValue, 3)} | ${fixed(p.meanWavesSurvived)} |`,
        ),
        '',
        '## Raider fingerprints (pooled over runs)',
        '',
        `Range is to the engaged target, in km; the table shows the share of raider-time in each bin.`,
        '',
        `| profile | raiders | raider-s | ${RANGE_BIN_EDGES.map((_, bin) => binLabel(bin)).join(' | ')} | mean speed m/s | fire duty | switches/min | hits | on broken plates |`,
        `|---|---|---|${RANGE_BIN_EDGES.map(() => '---').join('|')}|---|---|---|---|---|`,
        ...profiles.map((p) => {
            const f = p.fingerprint;
            return `| ${p.profile} | ${f.raiders} | ${fixed(f.seconds, 0)} | ${f.rangeShare.map(pct).join(' | ')} | ${fixed(f.meanSpeed, 0)} | ${pct(f.fireDuty)} | ${fixed(f.attentionSwitchesPerMinute)} | ${f.hits} | ${f.brokenPlateShare === null ? '-' : pct(f.brokenPlateShare)} |`;
        }),
        '',
        `## Range separation (total variation, 0 identical to 1 disjoint; below ${RANGE_SEPARATION_FLOOR} the profiles are not told apart by range)`,
        '',
        `| | ${profiles.map((p) => p.profile).join(' | ')} |`,
        `|---|${profiles.map(() => '---').join('|')}|`,
        ...profiles.map(
            (a) =>
                `| ${a.profile} | ${profiles.map((b) => (a === b ? '.' : fixed(rangeSeparation(a.fingerprint, b.fingerprint)))).join(' | ')} |`,
        ),
        '',
    ];
    return lines.join('\n');
}
