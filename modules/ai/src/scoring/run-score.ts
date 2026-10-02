import { SavedGame } from '@starwards/core/internal';
import { readFrames } from './recording';
import { scoreSnapshot } from './score';

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
    helms: number;
    weapons: number;
    engineer: number;
    signals: number;
};

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
    const sums: RunScore = { value: 0, kill: 0, damage: 0, helms: 0, weapons: 0, engineer: 0, signals: 0 };
    let weight = 0;
    frames.forEach(({ t, saved }, i) => {
        const score = scoreSnapshot(saved, playerId);
        // a frame stands for the time until the next one; the last for the rest of the run
        const dt = Math.max(0, (frames[i + 1]?.t ?? seconds) - t);
        if (!score || dt === 0) return;
        weight += dt;
        sums.value += dt * score.overall.value;
        sums.kill += dt * score.overall.kill;
        sums.damage += dt * score.overall.damage;
        sums.helms += dt * score.stations.helms;
        sums.weapons += dt * score.stations.weapons;
        sums.engineer += dt * score.stations.engineer;
        sums.signals += dt * score.stations.signals;
    });
    if (weight === 0) return undefined;
    const afterKill = killed ? Math.max(0, timeoutSeconds - seconds) : 0;
    return {
        value: (sums.value + afterKill) / (weight + afterKill),
        kill: sums.kill / weight,
        damage: sums.damage / weight,
        helms: sums.helms / weight,
        weapons: sums.weapons / weight,
        engineer: sums.engineer / weight,
        signals: sums.signals / weight,
    };
}

/** Scores a recorded run from its `.sgr` frames. */
export async function scoreRun(recording: string, outcome: RunOutcome) {
    return scoreFrames(await readFrames(recording), outcome);
}
