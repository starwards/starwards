import { MISSILE_MIN_LAUNCH_METERS, missileLaunchRange } from '@starwards/bots';
import { PairedComparison, pairedComparison, pairedText } from '../training/paired';

import { BranchRow } from './corpus';

/** The reference missile's launch envelope against a still target: a state feature has no target motion. */
const ENVELOPE_METERS = missileLaunchRange('HiExpMissile', 0);

/** State features a finding is split by: each names a predicate on the branch point's state. */
const FEATURES: Record<string, (row: BranchRow) => boolean> = {
    all: () => true,
    'no enemy in sight': (r) => r.state.enemies === 0,
    'enemy beyond 10 km': (r) => (r.state.nearestEnemy?.distance ?? 0) > 10_000,
    'enemy beyond missile envelope': (r) => (r.state.nearestEnemy?.distance ?? 0) > ENVELOPE_METERS,
    'enemy in missile envelope': (r) => {
        const d = r.state.nearestEnemy?.distance;
        return d !== undefined && d >= MISSILE_MIN_LAUNCH_METERS && d <= ENVELOPE_METERS;
    },
    'enemy inside 1 km': (r) => (r.state.nearestEnemy?.distance ?? Infinity) < MISSILE_MIN_LAUNCH_METERS,
    'two or more enemies': (r) => r.state.enemies >= 2,
    'armor below 75%': (r) => (r.state.armor ?? 1) < 0.75,
    'energy below 30%': (r) => (r.state.energy ?? 1) < 0.3,
    'station in sight': (r) => r.state.stations.length > 0,
};

/** One alternative kind at one level, under one state feature, against the recorded runs. */
type Finding = {
    level: string;
    kind: string;
    feature: string;
    taken: string[];
    branches: number;
    value: PairedComparison;
    killsUp: number;
    killsDown: number;
    /** Branches whose replay diverged from the recording before their point: excluded. */
    excluded: number;
};

/**
 * Pairs every branch with the recorded run it left (same seed, same prefix): per level, per
 * alternative kind and per state feature, the paired run-value difference (branch − recorded), its 95%
 * t interval and sign test, and how often the branch gained or lost a kill. Only branches whose
 * prefix matched the recording count.
 */
export function mine(rows: readonly BranchRow[], minBranches = 3): Finding[] {
    const findings: Finding[] = [];
    const groups = new Map<string, BranchRow[]>();
    for (const r of rows) {
        const key = `${r.level}\u0000${r.kind}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const [key, list] of groups) {
        const [level, kind] = key.split('\u0000');
        for (const [feature, holds] of Object.entries(FEATURES)) {
            const valid = list.filter((r) => holds(r) && r.prefixMatches && r.delta.value !== null);
            if (valid.length < minBranches) continue;
            findings.push({
                level,
                kind,
                feature,
                taken: [...new Set(valid.map((r) => r.taken))],
                branches: valid.length,
                value: pairedComparison(
                    valid.map((r) => r.baseline.value!),
                    valid.map((r) => r.outcome.value!),
                ),
                killsUp: valid.filter((r) => r.delta.kills > 0).length,
                killsDown: valid.filter((r) => r.delta.kills < 0).length,
                excluded: list.filter((r) => holds(r) && !r.prefixMatches).length,
            });
        }
    }
    return findings.sort((a, b) => b.value.meanDiff - a.value.meanDiff);
}

/** Whether a finding beats the recorded play beyond noise: interval above zero, or sign p under 0.05 with more wins. */
function beats(f: Finding) {
    return f.value.ci[0] > 0 || (f.value.signP < 0.05 && f.value.wins > f.value.losses);
}

function worse(f: Finding) {
    return f.value.ci[1] < 0 || (f.value.signP < 0.05 && f.value.losses > f.value.wins);
}

/** The mining report: per level, the alternatives that beat or lose to the recorded play, by state feature. */
export function mineReport(rows: readonly BranchRow[], findings: readonly Finding[]) {
    const levels = [...new Set(rows.map((r) => r.level))];
    const lines = ['# Branch mining', ''];
    const diverged = rows.filter((r) => !r.prefixMatches).length;
    lines.push(
        `${rows.length} branches over ${new Set(rows.map((r) => r.seed)).size} seeds; ${diverged} diverged from their recording before the branch point (excluded).`,
        '',
    );
    const table = (list: readonly Finding[]) => [
        '| kind | state | taken | branches | run value (branch − recorded) | kills gained / lost |',
        '| --- | --- | --- | --- | --- | --- |',
        ...list.map(
            (f) =>
                `| ${f.kind} | ${f.feature} | ${f.taken.join(', ')} | ${f.branches} | ${pairedText(f.value)} | ${f.killsUp} / ${f.killsDown} |`,
        ),
    ];
    for (const level of levels) {
        const mineHere = findings.filter((f) => f.level === level);
        lines.push(`## ${level}`, '');
        const better = mineHere.filter(beats);
        const lost = mineHere.filter(worse);
        lines.push('### Beats the recorded play', '', ...(better.length ? table(better) : ['none beyond noise']), '');
        lines.push('### Loses to the recorded play', '', ...(lost.length ? table(lost) : ['none beyond noise']), '');
        lines.push('### All (feature `all`)', '', ...table(mineHere.filter((f) => f.feature === 'all')), '');
    }
    return lines.join('\n');
}
