import { RecordingEventLine, SavedGame } from '@starwards/core/internal';
import { SnapshotScore, scoreSnapshot } from './score';
import { observeTactical, weaponsScore } from './weapons-kpi';
import { readEvents, readFrames } from './recording';

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

/** `undefined` when no frame holds both the player and an opponent. */
export function scoreFrames(
    frames: readonly { t: number; saved: SavedGame }[],
    { killed, seconds, timeoutSeconds, playerId }: RunOutcome,
    events: readonly RecordingEventLine[] = [],
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
    const friendlyHits = friendlyHitsOf(frames, events, playerId);
    return {
        value: (value + afterKill) / (weight + afterKill) - FRIENDLY_HIT_COST * friendlyHits,
        friendlyHits,
        weapons: weaponsOf(frames, events, playerId),
        ...(Object.fromEntries(KEYS.map((k) => [k, sums[k] / weight])) as Record<keyof typeof READ, number>),
    };
}

/** Recorded `damage` events dealt by the player's rounds to another ship of its own faction. */
function friendlyHitsOf(
    frames: readonly { t: number; saved: SavedGame }[],
    events: readonly RecordingEventLine[],
    playerId: string | undefined,
) {
    const ships = frames[0]?.saved.fragment.ship;
    const id = playerId ?? [...(ships?.values() ?? [])].find((s) => s.isPlayerShip)?.id;
    const own = id === undefined ? undefined : factionOf(frames, id);
    if (own === undefined) return 0;
    return events.filter((e) => {
        if (e.kind !== 'damage' || !e.objectId || e.objectId === id) return false;
        return (e.data as { shooterId?: string }).shooterId === id && factionOf(frames, e.objectId) === own;
    }).length;
}

/** A ship's faction from the first frame that holds it. */
function factionOf(frames: readonly { saved: SavedGame }[], id: string) {
    for (const { saved } of frames) {
        const faction = saved.fragment.space.getShip(id)?.faction;
        if (faction !== undefined) return faction;
    }
    return undefined;
}

function weaponsOf(
    frames: readonly { t: number; saved: SavedGame }[],
    events: readonly RecordingEventLine[],
    playerId: string | undefined,
) {
    const id = playerId ?? [...(frames[0]?.saved.fragment.ship.values() ?? [])].find((s) => s.isPlayerShip)?.id;
    if (!id || !events.some((e) => e.kind === 'shot')) return null;
    const tactical = frames.flatMap((f) => observeTactical(f.t, f.saved, id) ?? []);
    return weaponsScore(tactical, events, id).kw;
}

/** Scores a recorded run from its `.sgr` frames and `.events.jsonl` sidecar. */
export async function scoreRun(recording: string, outcome: RunOutcome) {
    return scoreFrames(await readFrames(recording), outcome, readEvents(recording));
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
