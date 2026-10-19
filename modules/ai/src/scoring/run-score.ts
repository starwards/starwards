import { RecordingEventLine, SavedGame } from '@starwards/core/internal';
import { SnapshotScore, scoreSnapshot } from './score';
import { TacticalFrame, observeTactical, weaponsScore } from './weapons-kpi';
import { readEvents, streamFrames } from './recording';

/**
 * A whole run as one number per score, each the time-mean of the snapshot score over the run's frames.
 * A kill is one bit per run; these move with every second the crew spent well or badly placed, so two
 * crews on the same seeds separate with fewer seeds.
 *
 * `value` is taken over the full timeout: the time left after a kill counts as 1 (the target is dead,
 * nothing more can be lost), so an early kill scores above a late one and any kill above none.
 * The other scores are means over the frames in which the duel was on, except `weapons`: the weapons
 * station score K_w (`weaponsScore`), computed exactly from the recorded `shot` and `damage` events over
 * the whole run; `null` without events or when no round was fired.
 *
 * Friendly fire costs the run: `value` is charged {@link FRIENDLY_HIT_COST} for every recorded `damage`
 * event our rounds dealt an ally (`friendlyHits`), so 1/FRIENDLY_HIT_COST friendly hits erase a whole
 * run's worth of value.
 */
export type RunScore = {
    value: number;
    friendlyHits: number;
    weapons: number | null;
    kill: number;
    damage: number;
    tactical: number;
    opportunity: number;
    conversion: number;
    helms: number;
    engineer: number;
};

/** Run value lost per damage event our rounds deal an ally: 200 such hits cost as much as the whole run is worth. */
export const FRIENDLY_HIT_COST = 0.005;

/** Each run score's snapshot score, except `value` (which also counts the time after a kill). */
const READ: Record<Exclude<keyof RunScore, 'value' | 'weapons' | 'friendlyHits'>, (s: SnapshotScore) => number> = {
    kill: (s) => s.overall.kill,
    damage: (s) => s.overall.damage,
    tactical: (s) => s.tactical.score,
    opportunity: (s) => s.tactical.opportunity,
    conversion: (s) => s.tactical.conversion,
    helms: (s) => s.stations.helms,
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

type Frame = { t: number; saved: SavedGame };

/**
 * Folds a run's frames one at a time, so a caller can stream a long recording instead of holding every decoded
 * frame: it keeps one frame back (a frame's weight is the time until the next one), each ship's first-seen
 * faction, and the player's tactical observations. `result` is `undefined` when no frame holds both the player
 * and an opponent.
 */
export function runScorer(
    { timeoutSeconds, playerId }: Pick<RunOutcome, 'timeoutSeconds' | 'playerId'>,
    events: readonly RecordingEventLine[] = [],
) {
    let value = 0;
    const sums = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<keyof typeof READ, number>;
    let weight = 0;
    let id = playerId;
    let first = true;
    let previous: Frame | undefined;
    const factions = new Map<string, number>();
    const fired = events.some((e) => e.kind === 'shot');
    const tactical: TacticalFrame[] = [];

    const weigh = ({ t, saved }: Frame, until: number) => {
        const score = scoreSnapshot(saved, playerId);
        const dt = Math.max(0, until - t);
        if (!score || dt === 0) return;
        weight += dt;
        value += dt * score.overall.value;
        for (const k of KEYS) sums[k] += dt * READ[k](score);
    };

    return {
        add(frame: Frame) {
            if (previous) weigh(previous, frame.t);
            previous = frame;
            if (first) {
                first = false;
                id ??= [...frame.saved.fragment.ship.values()].find((s) => s.isPlayerShip)?.id;
            }
            for (const ship of frame.saved.fragment.space.getAll('Spaceship')) {
                if (!factions.has(ship.id)) factions.set(ship.id, ship.faction);
            }
            if (fired && id) {
                const observed = observeTactical(frame.t, frame.saved, id);
                if (observed) tactical.push(observed);
            }
        },
        /** `killed` and `seconds` are asked for last, so a caller can learn them from the same pass. */
        result({ killed, seconds }: Pick<RunOutcome, 'killed' | 'seconds'>): RunScore | undefined {
            if (previous) weigh(previous, seconds);
            previous = undefined;
            if (weight === 0) return undefined;
            const afterKill = killed ? Math.max(0, timeoutSeconds - seconds) : 0;
            const own = id === undefined ? undefined : factions.get(id);
            const friendlyHits =
                own === undefined
                    ? 0
                    : events.filter(
                          (e) =>
                              e.kind === 'damage' &&
                              !!e.objectId &&
                              e.objectId !== id &&
                              (e.data as { shooterId?: string }).shooterId === id &&
                              factions.get(e.objectId) === own,
                      ).length;
            return {
                value: (value + afterKill) / (weight + afterKill) - FRIENDLY_HIT_COST * friendlyHits,
                friendlyHits,
                weapons: id && fired ? weaponsScore(tactical, events, id).kw : null,
                ...(Object.fromEntries(KEYS.map((k) => [k, sums[k] / weight])) as Record<keyof typeof READ, number>),
            };
        },
    };
}

/** {@link runScorer} over frames already in memory. */
export function scoreFrames(frames: readonly Frame[], outcome: RunOutcome, events: readonly RecordingEventLine[] = []) {
    const scorer = runScorer(outcome, events);
    for (const frame of frames) scorer.add(frame);
    return scorer.result(outcome);
}

/** Scores a recorded run from its `.sgr` frames, streamed, and its `.events.jsonl` sidecar. */
export async function scoreRun(recording: string, outcome: RunOutcome) {
    const scorer = runScorer(outcome, readEvents(recording));
    for await (const frame of streamFrames(recording)) scorer.add(frame);
    return scorer.result(outcome);
}

/** A station score of a crew's seat. */
type SeatScores = Partial<Record<'helms' | 'weapons' | 'tactical' | 'engineer', number | null>>;

/**
 * The station scores a crew is judged by, from its seats' stations. A crew with a Tactical station (the short
 * crew, helms and weapons fused) is scored as one seat by the tactical score (helms opportunity × weapons
 * conversion); helms and weapons have no score of their own there. Any other crew has helms, weapons and engineer
 * scores for the seats it has.
 */
export function seatScores(run: RunScore, stations: readonly string[]): SeatScores {
    const out: SeatScores = {};
    if (stations.includes('tactical')) out.tactical = run.tactical;
    else {
        if (stations.includes('helms')) out.helms = run.helms;
        if (stations.includes('weapons')) out.weapons = run.weapons;
    }
    if (stations.includes('engineer')) out.engineer = run.engineer;
    return out;
}
