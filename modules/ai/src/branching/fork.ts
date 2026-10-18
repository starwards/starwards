import { isRecordingName, sidecarName } from '@starwards/core/internal';
import { readEvents, readFrames } from '../scoring/recording';

import { Intervention } from './levels';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playCrewTraining } from '../training/train-crew';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { scoreFrames } from '../scoring/run-score';

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

type Frames = Awaited<ReturnType<typeof readFrames>>;

/**
 * Whether `id` was killed in `frames`, as the analysis store's `killedAt` finds it: a frame caught it
 * destroyed, or it left the recording before the run's last frame.
 */
function killedIn(frames: Frames, id: string, lastT: number) {
    let seen: number | undefined;
    for (const { t, saved } of frames) {
        const object = saved.fragment.space.get(id);
        if (!object) continue;
        if (object.destroyed) return true;
        seen = t;
    }
    return seen !== undefined && seen < lastT;
}

/**
 * Replays a recorded run from its seed and, from the branch point `t` on, plays `intervention`
 * instead; with no intervention, a plain replay. The harness is deterministic (same seed, same crew:
 * the same run), so the replay reproduces the recording up to `t` -- `prefix` lets a caller check it.
 * The outcome is read from the branch's recording alone (no analysis store), which goes to a scratch
 * folder deleted afterwards.
 */
export async function runBranch(
    run: RunSpec,
    t: number,
    intervention?: Intervention,
    keepDir?: string,
): Promise<Outcome> {
    const dir = keepDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'starwards-branch-'));
    try {
        const { recorder, enemies } = await playCrewTraining(run.crew, {
            scenario: run.scenario,
            seed: run.seed,
            timeoutSeconds: run.timeoutSeconds,
            latencySeconds: run.latencySeconds ?? 0.2,
            outDir: dir,
            intervalSimSeconds: 1,
            branch: intervention,
        });
        const recording = recorder.filePath;
        const frames = await readFrames(recording);
        const seconds = Math.max(0, ...frames.map((f) => f.t));
        const kills = enemies.filter((id) => killedIn(frames, id, seconds)).length;
        const killed = kills === enemies.length;
        const score = scoreFrames(
            frames,
            { killed, seconds, timeoutSeconds: run.timeoutSeconds, playerId: TRAINING_PLAYER_ID },
            readEvents(recording),
        );
        return {
            killed,
            seconds,
            kills,
            enemies: enemies.length,
            value: score?.value ?? null,
            ...fingerprint(recording, t),
        };
    } finally {
        if (!keepDir) await rmDirRetrying(dir);
    }
}
