import { SnapshotScore, scoreSnapshot } from './score';
import { SavedGame } from '@starwards/core/internal';
import { readFrames } from './recording';

/**
 * A whole run as one number per score, each the time-mean of the snapshot score over the run's frames.
 * A kill is one bit per run; these move with every second the crew spent well or badly placed, so two
 * crews on the same seeds separate with fewer seeds.
 *
 * `value` is taken over the full timeout: the time left after a kill counts as 1 (the target is dead,
 * nothing more can be lost), so an early kill scores above a late one and any kill above none.
 * The other scores are means over the frames in which the duel was on.
 */
export type RunScore = {
    value: number;
    kill: number;
    damage: number;
    tactical: number;
    opportunity: number;
    conversion: number;
    helms: number;
    weapons: number;
    engineer: number;
};

/** Each run score's snapshot score, except `value` (which also counts the time after a kill). */
const READ: Record<Exclude<keyof RunScore, 'value'>, (s: SnapshotScore) => number> = {
    kill: (s) => s.overall.kill,
    damage: (s) => s.overall.damage,
    tactical: (s) => s.tactical.score,
    opportunity: (s) => s.tactical.opportunity,
    conversion: (s) => s.tactical.conversion,
    helms: (s) => s.stations.helms,
    weapons: (s) => s.stations.weapons,
    engineer: (s) => s.stations.engineer,
};
const KEYS = Object.keys(READ) as (keyof typeof READ)[];

type RunOutcome = {
    killed: boolean;
    /** Sim-seconds the run lasted. */
    seconds: number;
    timeoutSeconds: number;
    playerId?: string;
};

/** `undefined` when no frame holds both the player and an opponent. */
export function scoreFrames(
    frames: readonly { t: number; saved: SavedGame }[],
    { killed, seconds, timeoutSeconds, playerId }: RunOutcome,
): RunScore | undefined {
    let value = 0;
    const sums = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<keyof typeof READ, number>;
    let weight = 0;
    frames.forEach(({ t, saved }, i) => {
        const score = scoreSnapshot(saved, playerId);
        // a frame stands for the time until the next one; the last for the rest of the run
        const dt = Math.max(0, (frames[i + 1]?.t ?? seconds) - t);
        if (!score || dt === 0) return;
        weight += dt;
        value += dt * score.overall.value;
        for (const k of KEYS) sums[k] += dt * READ[k](score);
    });
    if (weight === 0) return undefined;
    const afterKill = killed ? Math.max(0, timeoutSeconds - seconds) : 0;
    return {
        value: (value + afterKill) / (weight + afterKill),
        ...(Object.fromEntries(KEYS.map((k) => [k, sums[k] / weight])) as Record<keyof typeof READ, number>),
    };
}

/** Scores a recorded run from its `.sgr` frames. */
export async function scoreRun(recording: string, outcome: RunOutcome) {
    return scoreFrames(await readFrames(recording), outcome);
}
