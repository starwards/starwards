import { RecordingEventLine, SavedGame } from '@starwards/core/internal';
import { TACTICAL_WEIGHTS, observeTactical, tacticalSeries, weaponsSeries } from './weapons-kpi';
import { components, engineerKpi30, observe } from './engineer-kpi';
import { duelOf, geometry, inFiringPosition, integrity } from './features';

/**
 * Training targets for the snapshot scorer, read from the future of the same run. Definitions
 * (also in `docs/integration/ai-crew.md#snapshot-scoring`):
 *
 * Overall
 * - `kill60`: 1 if the target is gone (despawned or destroyed) at some frame in (t, t+60 s]; 0 if it
 *   is alive through t+60 s; censored (`null`) when the run ends before t+60 s with the target alive.
 * - `damage30`: drop of the player's `integrity` from t to t+30 s, clipped at 0 (0..1). Censored when
 *   the run ends first.
 *
 * Tactical (helms + weapons), over the 45 s window of `TACTICAL_WEIGHTS` starting at t (`weapons-kpi.ts`):
 * - `tactical45`: T, clipped to [0, 1] (friendly fire can push credit below 0).
 * - `opportunity45`: O, helms' share. `conversion45`: V = T / O, weapons' share; censored where O = 0.
 *
 * Stations
 * - `helms10`: share of the frames in (t, t+10 s] where the player is in firing position (gun band and
 *   nose line within 100 m of the target). Censored when the window is not complete (incl. a kill).
 *   Not validated against outcomes or policy orderings.
 * - `weapons_kw30`: weapons station score K_w over the rounds fired in (t, t+30 s], divided by its
 *   ceiling 1.5 and clipped to [0, 1]; censored where no round was fired or the run ends first.
 * - `engineer_kpi30`: mean engineer score K over (t, t+30 s] (`engineer-kpi.ts`).
 *
 * The tactical and weapons labels need the sidecar's `shot` and `damage` events: censored for a run
 * recorded without them, never imputed.
 */
export const LABELS = [
    'kill60',
    'damage30',
    'tactical45',
    'opportunity45',
    'conversion45',
    'helms10',
    'weapons_kw30',
    'engineer_kpi30',
] as const;
export type LabelName = (typeof LABELS)[number];

/** Ceiling of K_w: no wasted or dominated round, nothing friendly hit, the lock held throughout. */
const KW_MAX = 1.5;
const KW_HORIZON = 30;

/** What a duel label needs from one frame, with the duel pinned by ids so the target is followed into the future. */
interface FrameSummary {
    readonly t: number;
    readonly targetAlive: boolean;
    readonly playerIntegrity: number;
    readonly firing: boolean;
}

/** Summary of one frame for the duel `playerId` vs `targetId`; a missing ship counts as destroyed. */
export function summarize(t: number, saved: SavedGame, playerId: string, targetId: string): FrameSummary {
    const player = saved.fragment.ship.get(playerId);
    const duel = duelOf(saved, playerId, targetId);
    return {
        t,
        targetAlive: !!saved.fragment.space.getShip(targetId) && !saved.fragment.space.getShip(targetId)?.destroyed,
        playerIntegrity: player && saved.fragment.space.getShip(playerId) ? integrity(player) : 0,
        firing: duel ? inFiringPosition(geometry(duel)) : false,
    };
}

/**
 * The duel labels of frame `i` of a run whose frames have all been summarised against frame i's duel
 * (`future[k]` = summary of frame k pinned to frame i's player/target ids; `future[i]` is frame i).
 */
export function duelLabelsAt(future: readonly FrameSummary[], i: number) {
    const now = future[i];
    const endT = future[future.length - 1].t;
    const window = (h: number) => future.slice(i + 1).filter((f) => f.t <= now.t + h + 1e-6);
    const complete = (h: number) => endT >= now.t + h - 1e-6;

    const killed = window(60).some((f) => !f.targetAlive);
    const kill60 = killed ? 1 : complete(60) ? 0 : null;

    const at30 = complete(30) ? window(30).at(-1) : undefined;
    const damage30 = at30 ? Math.max(0, now.playerIntegrity - at30.playerIntegrity) : null;

    const w10 = window(10);
    const full10 = complete(10) && w10.every((f) => f.targetAlive);
    const helms10 = full10 && w10.length ? w10.filter((f) => f.firing).length / w10.length : null;

    return { kill60, damage30, helms10 };
}

const clip01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Tactical, weapons and engineer labels of every frame of a run (by frame index), for the player
 * `playerId`. `weaponsEvents` false censors the tactical and weapons labels.
 */
export function runLabels(
    frames: readonly { t: number; saved: SavedGame }[],
    events: readonly RecordingEventLine[],
    playerId: string,
    weaponsEvents: boolean,
) {
    const out = frames.map(() => ({
        tactical45: null as number | null,
        opportunity45: null as number | null,
        conversion45: null as number | null,
        weapons_kw30: null as number | null,
        engineer_kpi30: null as number | null,
    }));
    const seen = frames.flatMap((f, i) => {
        const o = observe(f.t, f.saved, playerId);
        return o ? [{ i, o }] : [];
    });
    if (seen.length) {
        const kpi = engineerKpi30(
            components(
                seen.map((s) => s.o),
                events,
                playerId,
            ),
        );
        seen.forEach((s, j) => (out[s.i].engineer_kpi30 = kpi[j]));
    }
    if (!weaponsEvents) return out;
    const tactical = frames.flatMap((f, i) => {
        const tf = observeTactical(f.t, f.saved, playerId);
        return tf ? [{ i, tf }] : [];
    });
    const tfs = tactical.map((x) => x.tf);
    const windows = tacticalSeries(tfs, events, playerId, TACTICAL_WEIGHTS);
    const kw = weaponsSeries(tfs, events, playerId, KW_HORIZON);
    tactical.forEach(({ i }, j) => {
        const w = windows[j];
        if (w && w.T !== null) {
            out[i].tactical45 = clip01(w.T);
            out[i].opportunity45 = clip01(w.O);
            out[i].conversion45 = w.O > 1e-9 ? clip01(w.T / w.O) : null;
        }
        const k = kw[j];
        out[i].weapons_kw30 = k === null ? null : clip01(k / KW_MAX);
    });
    return out;
}
