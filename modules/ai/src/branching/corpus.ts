import { BranchPoint, DecisionLevel } from './levels';
import { Outcome, RunSpec, fingerprint, runBranch } from './fork';

import { StateSummary } from './run-log';

/** One branch: where it left the recorded run, what it did instead, and how that came out against the run. */
export type BranchRow = {
    seed: number;
    level: string;
    t: number;
    reasons: string[];
    taken: string;
    alternative: string;
    kind: string;
    state: Omit<StateSummary, 'board'>;
    outcome: Outcome;
    /** The recorded run's own outcome: the paired baseline. */
    baseline: { killed: boolean; seconds: number; kills: number; value: number | null };
    /** Branch minus recorded run. */
    delta: { value: number | null; kills: number; killed: number; seconds: number | null };
    /** Whether the branch played exactly as the recording up to its point. */
    prefixMatches: boolean;
};

/** A recorded run to branch from: its spec, its recording and its outcome. */
export type CorpusRun = RunSpec & {
    recording: string;
    baseline: BranchRow['baseline'];
};

/** One unit of work: a branch at one point of one run. */
type BranchJob = { run: CorpusRun; point: BranchPoint; alternative: string; kind: string };

/**
 * The branches to play over `runs`, at most `budget` in all: every level's points and alternatives,
 * taken round-robin over runs so a cut budget still covers every seed.
 */
export function planCorpus(
    runs: readonly { run: CorpusRun; log: Parameters<DecisionLevel['points']>[0] }[],
    levels: readonly DecisionLevel[],
    budget: number,
) {
    const perRun = runs.map(({ run, log }) =>
        levels.flatMap((level) =>
            level
                .points(log)
                .flatMap((point) =>
                    level.alternatives(point, log).map((a) => ({ run, point, alternative: a.id, kind: a.kind, level })),
                ),
        ),
    );
    const jobs: (BranchJob & { level: DecisionLevel })[] = [];
    for (let i = 0; jobs.length < budget && perRun.some((list) => i < list.length); i++) {
        for (const list of perRun) {
            if (i < list.length && jobs.length < budget) jobs.push(list[i]);
        }
    }
    return jobs;
}

/** Plays one planned branch and pairs it with its recorded run. */
export async function playJob(
    job: BranchJob,
    level: DecisionLevel,
    log: Parameters<DecisionLevel['points']>[0],
): Promise<BranchRow> {
    const alternative = level.alternatives(job.point, log).find((a) => a.id === job.alternative);
    if (!alternative) throw new Error(`no alternative ${job.alternative} at ${job.point.t}`);
    const outcome = await runBranch(job.run, job.point.t, alternative.intervention);
    const recorded = fingerprint(job.run.recording, job.point.t);
    const { board: _board, ...state } = job.point.state;
    const b = job.run.baseline;
    return {
        seed: job.run.seed,
        level: job.point.level,
        t: job.point.t,
        reasons: job.point.reasons,
        taken: job.point.taken,
        alternative: job.alternative,
        kind: job.kind,
        state,
        outcome,
        baseline: b,
        delta: {
            value: outcome.value !== null && b.value !== null ? outcome.value - b.value : null,
            kills: outcome.kills - b.kills,
            killed: Number(outcome.killed) - Number(b.killed),
            seconds: outcome.killed && b.killed ? outcome.seconds - b.seconds : null,
        },
        prefixMatches: outcome.prefix === recorded.prefix,
    };
}
