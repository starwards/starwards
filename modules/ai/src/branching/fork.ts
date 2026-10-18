import { CrewRunResult, runCrewTraining } from '../training/train-crew';
import { isRecordingName, sidecarName } from '@starwards/core/internal';

import { Intervention } from './levels';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';

/** The run a branch replays: the crew, rung, seed and timeout of a recorded run. */
export type RunSpec = { crew: string; scenario: string; seed: number; timeoutSeconds: number; latencySeconds?: number };

/** A branch's (or a replay's) outcome, kept after its recording is deleted. */
export type Outcome = {
    killed: boolean;
    seconds: number;
    kills: number;
    enemies: number;
    /** Run value (`scoring/run-score.ts`): the time-mean snapshot score, the time after a kill counting 1. */
    value: number | null;
    /** Fingerprint of the crew's decisions, callouts, commands and orders before the branch point. */
    prefix: string;
    /** Fingerprint of the whole run's crew events: equal for two runs that played identically. */
    whole: string;
};

/** Crew event kinds that make up how a run was played. */
const PLAYED = new Set(['decision', 'callout', 'command', 'orders']);

/** Fingerprints of a run's crew events before `t`, and of all of them. */
export function fingerprint(recordingOrSidecar: string, t: number) {
    const sidecar = isRecordingName(recordingOrSidecar) ? sidecarName(recordingOrSidecar) : recordingOrSidecar;
    const prefix = crypto.createHash('sha1');
    const whole = crypto.createHash('sha1');
    for (const line of fs.readFileSync(sidecar, 'utf8').split('\n')) {
        const m = /^\{"t":([^,]+),"kind":"([^"]+)"/.exec(line);
        if (!m || !PLAYED.has(m[2])) continue;
        whole.update(line);
        if (Number(m[1]) < t - 1e-9) prefix.update(line);
    }
    return { prefix: prefix.digest('hex').slice(0, 12), whole: whole.digest('hex').slice(0, 12) };
}

function outcomeOf(result: CrewRunResult, recording: string, t: number): Outcome {
    return {
        killed: result.killed,
        seconds: result.seconds,
        kills: result.kills,
        enemies: result.enemies,
        value: result.score?.value ?? null,
        ...fingerprint(recording, t),
    };
}

/**
 * Replays a recorded run from its seed and, from the branch point `t` on, plays `intervention`
 * instead; with no intervention, a plain replay. The harness is deterministic (same seed, same crew:
 * the same run), so the replay reproduces the recording up to `t` -- `prefix` lets a caller check it.
 * The branch's recording goes to a scratch folder deleted afterwards; only its outcome is kept.
 */
export async function runBranch(
    run: RunSpec,
    t: number,
    intervention?: Intervention,
    keepDir?: string,
): Promise<Outcome> {
    const dir = keepDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'starwards-branch-'));
    try {
        const result = await runCrewTraining(run.crew, {
            scenario: run.scenario,
            seed: run.seed,
            timeoutSeconds: run.timeoutSeconds,
            latencySeconds: run.latencySeconds ?? 0.2,
            outDir: dir,
            intervalSimSeconds: 1,
            branch: intervention,
        });
        if (!result.recording) throw new Error('branch run left no recording');
        return outcomeOf(result, result.recording, t);
    } finally {
        if (!keepDir) await rmDirRetrying(dir);
    }
}
