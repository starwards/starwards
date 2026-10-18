import fs from 'node:fs';
import path from 'node:path';

import { tokensUsd } from './spend-guard';

/**
 * One Jev decision with what it was asked from, what it answered, what it cost and, once a branch
 * replayed it differently, what the alternative was worth. Inputs are referenced, not copied: the
 * answer cache holds the request under `cacheKey`, the recording's events file holds the display.
 */
export type DecisionRow = {
    /** `<run>#<seat>@<t>/<control>`: stable across re-runs of the same run name. */
    id: string;
    run: string;
    scenario: string;
    seed: number;
    seat: string;
    t: number;
    control: string;
    /** `play`: a Jev seat in a crew run; `proposal`: a branch corpus asking Jev for alternatives. */
    origin: 'play' | 'proposal';
    recording: string;
    node: string;
    commit: string;
    brain: string;
    version: number;
    model: string;
    cacheKey: string;
    cacheHit: boolean;
    inputTokens: number;
    /** The endpoint reports input tokens only. */
    outputTokens: number | null;
    usd: number;
    choice: string;
    confidence: number | null;
    probabilities: Record<string, number> | null;
    payout: Payout;
};

export type Payout =
    | { status: 'not_measured' }
    | {
          status: 'branched';
          /** Mean paired run value of the branches from this decision (branch − recorded). */
          delta: number | null;
          /** Per alternative played here: its mean Δ value and branch count. */
          alternatives: Record<string, { delta: number | null; branches: number }>;
          branches: string[];
          seeds: number[];
      };

type DecisionInput = Omit<DecisionRow, 'id' | 'usd' | 'payout' | 'node' | 'commit' | 'outputTokens'> & {
    outputTokens?: number | null;
};

const decisionId = (run: string, seat: string, t: number, control: string) =>
    `${run}#${seat}@${t.toFixed(3)}/${control}`;

/** A row as written: a cache hit costs nothing. */
export function decisionRow(input: DecisionInput, env: Record<string, string | undefined> = process.env): DecisionRow {
    return {
        id: decisionId(input.run, input.seat, input.t, input.control),
        ...input,
        node: process.version,
        commit: env.GIT_COMMIT ?? 'unknown',
        outputTokens: input.outputTokens ?? null,
        usd: input.cacheHit ? 0 : tokensUsd(input.inputTokens),
        payout: { status: 'not_measured' },
    };
}

/** Appends whole lines (one write call, O_APPEND): processes and pods sharing the file never interleave. */
export function appendRows(file: string, rows: readonly DecisionRow[]) {
    if (!rows.length) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { flag: 'a' });
}

export function readRows(file: string): DecisionRow[] {
    if (!fs.existsSync(file)) return [];
    return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as DecisionRow);
}

/** The ledger file the environment asks for: `JEV_DECISIONS`, unset for none. */
export function ledgerFromEnv(env: Record<string, string | undefined> = process.env) {
    return env.JEV_DECISIONS ? path.resolve(env.JEV_DECISIONS) : undefined;
}

/** The part of a branch row the payout join reads. */
type BranchFacts = {
    scenario?: string;
    seed: number;
    level: string;
    t: number;
    alternative: string;
    seat?: string;
    control?: string;
    prefixMatches: boolean;
    delta: { value: number | null };
};

const branchId = (b: BranchFacts) => `${b.scenario ?? '?'}/${b.seed}/${b.level}/${b.t.toFixed(3)}/${b.alternative}`;

/**
 * Fills `payout` of every row whose decision a branch replayed differently: same scenario and seed,
 * same seat (the captain for strategic and tactical branches), the same decision time. Diverged
 * branches compare nothing and are left out. Rows without a branch keep their payout.
 */
export function joinPayouts(rows: readonly DecisionRow[], branches: readonly BranchFacts[]): DecisionRow[] {
    const key = (scenario: string | undefined, seed: number, seat: string, t: number) =>
        `${scenario ?? '?'}|${seed}|${seat}|${t.toFixed(3)}`;
    const byPoint = new Map<string, BranchFacts[]>();
    for (const b of branches) {
        if (!b.prefixMatches) continue;
        const seat = b.seat ?? (b.level === 'button' ? undefined : 'captain');
        if (!seat) continue;
        const k = key(b.scenario, b.seed, seat, b.t);
        byPoint.set(k, [...(byPoint.get(k) ?? []), b]);
    }
    return rows.map((row) => {
        const found = (byPoint.get(key(row.scenario, row.seed, row.seat, row.t)) ?? []).filter(
            (b) => !b.control || b.control === row.control || b.level !== 'button',
        );
        if (!found.length) return row;
        const previous = row.payout.status === 'branched' ? row.payout : undefined;
        const ids = new Set(previous?.branches ?? []);
        const all = [...found.filter((b) => !ids.has(branchId(b)))];
        const alternatives = { ...(previous?.alternatives ?? {}) };
        const sums = new Map<string, { sum: number; n: number; branches: number }>();
        for (const [alt, a] of Object.entries(alternatives)) {
            sums.set(alt, {
                sum: (a.delta ?? 0) * a.branches,
                n: a.delta === null ? 0 : a.branches,
                branches: a.branches,
            });
        }
        for (const b of all) {
            const s = sums.get(b.alternative) ?? { sum: 0, n: 0, branches: 0 };
            s.branches++;
            if (b.delta.value !== null) {
                s.sum += b.delta.value;
                s.n++;
            }
            sums.set(b.alternative, s);
        }
        let total = 0;
        let n = 0;
        for (const [alt, s] of sums) {
            alternatives[alt] = { delta: s.n ? s.sum / s.n : null, branches: s.branches };
            total += s.sum;
            n += s.n;
        }
        return {
            ...row,
            payout: {
                status: 'branched' as const,
                delta: n ? total / n : null,
                alternatives,
                branches: [...ids, ...all.map(branchId)],
                seeds: [...new Set([...(previous?.seeds ?? []), ...all.map((b) => b.seed)])],
            },
        };
    });
}

/** Merges `rows` into the cumulative index (later rows of an id win unless the index already measured it). */
export function mergeIndex(index: readonly DecisionRow[], rows: readonly DecisionRow[]) {
    const byId = new Map(index.map((r) => [r.id, r]));
    for (const r of rows) {
        const known = byId.get(r.id);
        if (!known || (known.payout.status === 'not_measured' && r.payout.status === 'branched')) byId.set(r.id, r);
    }
    return [...byId.values()];
}

/** Writes a file whole under a private name, then renames it into place. */
export function writeRowsAtomic(file: string, rows: readonly DecisionRow[]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    fs.renameSync(temp, file);
}

/** Measured / total per scenario. */
export function coverage(rows: readonly DecisionRow[]) {
    const out: Record<string, { measured: number; total: number }> = {};
    for (const r of rows) {
        const c = (out[r.scenario] ??= { measured: 0, total: 0 });
        c.total++;
        if (r.payout.status === 'branched') c.measured++;
    }
    return out;
}

/**
 * Priority of an unmeasured decision for the next branch corpus (lower first): unmeasured before
 * measured, low confidence (max probability under `lowConfidence`) first, then choices whose kind has
 * the fewest measured payouts.
 */
export function coveragePriority(rows: readonly DecisionRow[], lowConfidence = 0.6) {
    const measuredByChoice = new Map<string, number>();
    for (const r of rows) {
        if (r.payout.status === 'branched') measuredByChoice.set(r.choice, (measuredByChoice.get(r.choice) ?? 0) + 1);
    }
    return (row: Pick<DecisionRow, 'payout' | 'probabilities' | 'confidence' | 'choice'>) => {
        const top = row.probabilities ? Math.max(...Object.values(row.probabilities)) : (row.confidence ?? 1);
        return (
            (row.payout.status === 'branched' ? 1000 : 0) +
            (top < lowConfidence ? 0 : 100) +
            Math.min(99, measuredByChoice.get(row.choice) ?? 0)
        );
    };
}
