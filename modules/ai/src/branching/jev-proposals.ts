import {
    BrainRequest,
    BrainSpec,
    CALLOUT_QUESTION,
    buildRequest,
    stationControls,
    verbalReader,
    whatIfForecaster,
} from '@starwards/bots';
import { BranchPoint, DecisionLevel } from './levels';
import { DecisionRow, decisionRow } from '../brain/decision-ledger';
import { JevAnswerCache, jevCacheKey, meteredJevClient } from '../brain/jev-cache';
import { JevClient, jevBody } from '../brain/jev-client';
import { RunLog, requestAt } from './run-log';
import { pessimisticUsd, reserve, settle } from '../brain/spend-guard';

/** One Jev proposal at a branch point: the alternative it maps to, its rank and Jev's probability for it. */
export type Proposal = { alternative: string; rank: number; probability: number; callout: string };

/** A point of one recorded run to ask about. */
export type ProposalPoint = {
    run: string;
    scenario: string;
    seed: number;
    recording: string;
    point: BranchPoint;
    level: DecisionLevel;
    log: RunLog;
};

export const proposalKey = (seed: number, level: string, t: number) => `${seed}/${level}/${t.toFixed(3)}`;

/**
 * The captain's request at `t`, rebuilt with `spec` from exactly what the recorded captain was shown
 * and heard (as `reask` does): what the Jev captain would have been asked at that decision.
 */
function captainRequestAt(spec: BrainSpec, log: RunLog, t: number): BrainRequest | undefined {
    const recorded = requestAt(log, spec.station, t);
    if (!recorded) return undefined;
    const controls = stationControls({
        display: recorded.display,
        capabilities: recorded.capabilities,
        burstSeconds: Math.min(5, spec.decisionSeconds),
    });
    const read = spec.view === 'verbal' ? verbalReader(spec.decisionSeconds) : undefined;
    return buildRequest(
        spec,
        recorded.display,
        controls,
        read?.(recorded.display),
        recorded.heard,
        whatIfForecaster(spec)?.(recorded.display, controls),
    );
}

/**
 * Jev's top `k` alternatives at a point: its callouts ranked by probability, without the call the run
 * made there and without silence, each mapped to the level's enumerated alternative of that kind (the
 * first one, e.g. the nearest station to dock at). A call the level cannot play is skipped.
 */
export function rankProposals(
    probabilities: Record<string, number>,
    point: BranchPoint,
    level: DecisionLevel,
    log: RunLog,
    k: number,
): Proposal[] {
    const alternatives = level.alternatives(point, log);
    const out: Proposal[] = [];
    const ranked = Object.entries(probabilities)
        .filter(([call]) => call !== 'silence' && call !== point.taken)
        .sort((a, b) => b[1] - a[1]);
    for (const [call, probability] of ranked) {
        const alt = alternatives.find((a) => a.kind === call && !out.some((p) => p.alternative === a.id));
        if (!alt) continue;
        out.push({ alternative: alt.id, rank: out.length + 1, probability, callout: call });
        if (out.length >= k) break;
    }
    return out;
}

type ProposalResult =
    | { refused: true; reason: string; total: number }
    | { refused: false; proposals: Map<string, Proposal[]>; rows: DecisionRow[]; paidTokens: number; usdHeld: number };

/**
 * Asks the Jev captain once per distinct request over `points` (a strategic and a tactical point at
 * the same decision share one) and ranks its answers into proposals. Before any request is sent, the
 * requests the answer cache cannot answer are priced pessimistically and reserved against `capUsd` in
 * the spend ledger; a refused reservation sends nothing. The reservation is settled with the tokens paid.
 */
export async function proposeAlternatives(
    points: readonly ProposalPoint[],
    spec: BrainSpec,
    k: number,
    guard: { ledger: string; capUsd: number; job: string },
    cache: JevAnswerCache | undefined,
    client: () => JevClient,
): Promise<ProposalResult> {
    const asked = points.flatMap((p) => {
        const request = captainRequestAt(spec, p.log, p.point.t);
        return request && CALLOUT_QUESTION in request.questions
            ? [{ ...p, request, key: jevCacheKey(request, spec.model) }]
            : [];
    });
    const unique = new Map(asked.map((a) => [a.key, a.request]));
    const misses = [...unique].filter(([key]) => !cache?.get(key));
    const estimate = misses.reduce((sum, [, request]) => sum + pessimisticUsd(jevBody(request, spec.model).length), 0);
    let reservation: { id: string; usd: number } | undefined;
    if (misses.length) {
        const held = reserve(guard.ledger, guard.job, estimate, guard.capUsd);
        if (!held.ok) return { refused: true, reason: held.reason, total: held.total };
        reservation = held.reservation;
    }
    const jev = meteredJevClient(
        misses.length ? client() : { ask: () => Promise.reject(new Error('no request may miss the cache')) },
        cache,
    );
    const answers = new Map<string, Awaited<ReturnType<JevClient['ask']>>>();
    try {
        for (const [key, request] of unique) answers.set(key, await jev.ask(request, spec.model));
    } finally {
        if (reservation) settle(guard.ledger, guard.job, reservation, jev.usage.paidTokens);
    }
    const proposals = new Map<string, Proposal[]>();
    const rows: DecisionRow[] = [];
    const charged = new Set<string>();
    for (const a of asked) {
        const response = answers.get(a.key)!;
        const answer = response.answers[CALLOUT_QUESTION];
        if (!answer) continue;
        proposals.set(
            proposalKey(a.seed, a.point.level, a.point.t),
            rankProposals(answer.probabilities ?? { [answer.choice]: answer.confidence }, a.point, a.level, a.log, k),
        );
        if (charged.has(a.key)) continue;
        charged.add(a.key);
        rows.push(
            decisionRow({
                run: a.run,
                scenario: a.scenario,
                seed: a.seed,
                seat: spec.station,
                t: a.point.t,
                control: CALLOUT_QUESTION,
                origin: 'proposal',
                recording: a.recording,
                brain: spec.id,
                version: spec.version,
                model: response.model,
                cacheKey: a.key,
                cacheHit: response.inputTokens === 0 && response.latencyMs === 0,
                inputTokens: response.inputTokens,
                choice: answer.choice,
                confidence: answer.confidence ?? null,
                probabilities: answer.probabilities ?? null,
            }),
        );
    }
    return { refused: false, proposals, rows, paidTokens: jev.usage.paidTokens, usdHeld: estimate };
}
