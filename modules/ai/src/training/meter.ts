import type { WaveRun } from './wave-compare';
import { wilson } from '../adversary/report';

/**
 * The depth meter: a mechanic is as deep as the pass-rate gap between a smart policy and a naive
 * one on the same scenario. Arms play unpaired (seeds do not pair: a placebo flips ~30% of seeds,
 * M4.78), so every comparison is two independent proportions.
 */
export type ArmRole = 'pure' | 'blind' | 'informed' | 'control';

export type MeterArm = { name: string; role: ArmRole; runs: readonly WaveRun[] };

type ArmStats = {
    name: string;
    role: ArmRole;
    runs: number;
    passes: number;
    rate: number;
    ci: readonly [number, number];
};

/** One-sided z for an 80% bound and for 95% / 80% power. */
const Z80 = 1.2816;
const Z95 = 1.6449;

export function armStats(arm: MeterArm): ArmStats {
    const passes = arm.runs.filter((r) => r.passed).length;
    return {
        name: arm.name,
        role: arm.role,
        runs: arm.runs.length,
        passes,
        rate: arm.runs.length ? passes / arm.runs.length : 0,
        ci: wilson(passes, arm.runs.length),
    };
}

/** Difference a − b of two independent pass rates with its two-sided 80% interval. */
export function unpairedDiff(a: ArmStats, b: ArmStats) {
    const diff = a.rate - b.rate;
    const se = Math.sqrt((a.rate * (1 - a.rate)) / Math.max(1, a.runs) + (b.rate * (1 - b.rate)) / Math.max(1, b.runs));
    return { diff, se, low80: diff - Z80 * se, high80: diff + Z80 * se };
}

/**
 * Runs per arm that detect a pass-rate gap of `deltaPp` points at one-sided 95% significance with
 * 80% power, two unpaired arms near `rate`.
 */
export function runsPerArm(rate: number, deltaPp: number): number {
    const delta = deltaPp / 100;
    const p2 = Math.min(0.999, rate + delta);
    const variance = rate * (1 - rate) + p2 * (1 - p2);
    return Math.ceil(((Z95 + 0.8416) ** 2 * variance) / delta ** 2);
}

type MeterCheck = { name: string; ok: boolean | null; detail: string };

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(100 * x).toFixed(1)} pp`;

/**
 * Success check: the informed arm beats every pure arm by `marginPp`, the blind arm lands between
 * the best pure arm and the informed arm (within the pooled noise), and the informed arm's pass
 * rate stays within `marginPp` of the control. `ok: null` where the question has no such arm.
 */
export function successChecks(arms: readonly MeterArm[], marginPp = 5): MeterCheck[] {
    const stats = arms.map(armStats);
    const of = (role: ArmRole) => stats.filter((s) => s.role === role);
    const [informed] = of('informed');
    const [blind] = of('blind');
    const [control] = of('control');
    const pure = of('pure');
    const margin = marginPp / 100;
    const checks: MeterCheck[] = [];
    if (!informed || !pure.length) {
        checks.push({ name: 'informed beats every pure', ok: null, detail: 'needs an informed arm and ≥1 pure arm' });
    } else {
        const rows = pure.map((p) => ({ p, d: unpairedDiff(informed, p) }));
        const worst = rows.reduce((a, b) => (b.d.diff < a.d.diff ? b : a));
        checks.push({
            name: 'informed beats every pure',
            ok: rows.every((r) => r.d.diff >= margin && r.d.low80 > 0),
            detail:
                rows
                    .map((r) => `vs ${r.p.name} ${pp(r.d.diff)} [80%: ${pp(r.d.low80)}, ${pp(r.d.high80)}]`)
                    .join('; ') + ` (weakest: ${worst.p.name}; need ≥ ${pp(margin)} with 80% lower bound > 0)`,
        });
    }
    if (!informed || !blind || !pure.length) {
        checks.push({ name: 'blind lands between', ok: null, detail: 'needs informed, blind and ≥1 pure arm' });
    } else {
        const best = pure.reduce((a, b) => (b.rate > a.rate ? b : a));
        const below = unpairedDiff(blind, best);
        const above = unpairedDiff(informed, blind);
        checks.push({
            name: 'blind lands between',
            ok: below.high80 >= 0 && above.high80 >= 0 && blind.rate <= informed.rate + margin,
            detail: `blind ${pct(blind.rate)} vs best pure ${best.name} ${pct(best.rate)} (${pp(below.diff)}), informed ${pp(above.diff)} above blind`,
        });
    }
    if (!informed || !control) {
        checks.push({ name: 'pass rate near the control', ok: null, detail: 'needs an informed and a control arm' });
    } else {
        const d = unpairedDiff(informed, control);
        checks.push({
            name: 'pass rate near the control',
            ok: Math.abs(d.diff) <= margin || (d.low80 <= 0 && d.high80 >= 0),
            detail: `informed ${pct(informed.rate)} vs ${control.name} ${pct(control.rate)} (${pp(d.diff)} [80%: ${pp(d.low80)}, ${pp(d.high80)}])`,
        });
    }
    return checks;
}

/**
 * Golden-rule check: each pure arm must be the best response against at least one target type.
 * A run's targets are its raiders by model (`ammo.raiders`); an arm's score against a model is the
 * share of that model's raiders it killed. Returns the per-model scores and, per pure arm, the
 * models it wins (best by more than `margin` over the runner-up, else a tie counts for no one).
 */
export function goldenRule(arms: readonly MeterArm[], margin = 0.03) {
    const pure = arms.filter((a) => a.role === 'pure');
    const share = (arm: MeterArm, model: string) => {
        const raiders = arm.runs.flatMap((r) => Object.values(r.ammo?.raiders ?? {})).filter((r) => r.model === model);
        return raiders.length
            ? { share: raiders.filter((r) => r.killedAt !== null).length / raiders.length, n: raiders.length }
            : null;
    };
    const models = [
        ...new Set(
            pure.flatMap((a) => a.runs.flatMap((r) => Object.values(r.ammo?.raiders ?? {}).map((x) => x.model))),
        ),
    ].sort();
    const table = models.map((model) => ({ model, byArm: pure.map((a) => ({ arm: a.name, ...share(a, model) })) }));
    const wins = new Map(pure.map((a) => [a.name, [] as string[]]));
    for (const row of table) {
        const scored = row.byArm.filter((x): x is typeof x & { share: number; n: number } => x.share !== undefined);
        if (scored.length < 2) continue;
        const sorted = [...scored].sort((a, b) => b.share - a.share);
        if (sorted[0].share - sorted[1].share > margin) wins.get(sorted[0].arm)?.push(row.model);
    }
    const losers = [...wins].filter(([, won]) => !won.length).map(([arm]) => arm);
    return {
        table,
        wins: Object.fromEntries(wins),
        ok: pure.length >= 2 && table.length ? losers.length === 0 : null,
        losers,
    };
}

/** The meter report for one question as Markdown. */
export function meterReport(
    question: string,
    arms: readonly MeterArm[],
    opts: { marginPp?: number; sizingRate?: number } = {},
): string {
    const marginPp = opts.marginPp ?? 5;
    const stats = arms.map(armStats);
    const control = stats.find((s) => s.role === 'control');
    const sizingRate = opts.sizingRate ?? control?.rate ?? 0.7;
    const need = runsPerArm(sizingRate, marginPp);
    const checks = successChecks(arms, marginPp);
    const golden = goldenRule(arms);
    const short = stats.filter((s) => s.runs < need);
    const out = [
        `# Depth meter: ${question}`,
        '',
        `Unpaired: seeds do not pair (placebo flips ~30%). Sizing: ≥ ${need} runs per arm detect ${marginPp} pp at pass rate ${pct(sizingRate)} (one-sided 95%, power 80%).`,
        '',
        '| arm | role | runs | pass | rate | 95% Wilson |',
        '| --- | --- | --- | --- | --- | --- |',
        ...stats.map(
            (s) =>
                `| ${s.name} | ${s.role} | ${s.runs} | ${s.passes} | ${pct(s.rate)} | ${pct(s.ci[0])}–${pct(s.ci[1])} |`,
        ),
        '',
        short.length
            ? `Underpowered: ${short.map((s) => `${s.name} (${s.runs})`).join(', ')} below ${need}.`
            : `All arms have ≥ ${need} runs.`,
        '',
        '## Success check',
        '',
        ...checks.map((c) => `- ${c.ok === null ? 'n/a' : c.ok ? 'PASS' : 'FAIL'} — ${c.name}: ${c.detail}`),
        '',
        '## Golden rule (each pure arm is the best response to ≥1 target type)',
        '',
    ];
    if (!golden.table.length) {
        out.push('No raider-model data in the runs (needs `ammo.raiders`).');
    } else {
        out.push(
            `| model | ${golden.table[0].byArm.map((a) => a.arm).join(' | ')} |`,
            `| --- | ${golden.table[0].byArm.map(() => '---').join(' | ')} |`,
            ...golden.table.map(
                (row) =>
                    `| ${row.model} | ${row.byArm.map((a) => (a.share === undefined ? '–' : `${pct(a.share)} (n=${a.n})`)).join(' | ')} |`,
            ),
            '',
            `- ${golden.ok === null ? 'n/a' : golden.ok ? 'PASS' : 'FAIL'}: ${Object.entries(golden.wins)
                .map(([arm, models]) => `${arm} best vs ${models.join(', ') || 'none'}`)
                .join('; ')}`,
        );
    }
    return out.join('\n') + '\n';
}
