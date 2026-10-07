import { RecordingEventLine, SavedGame } from '@starwards/core/internal';
import { TACTICAL_WEIGHTS, observeTactical, tacticalSeries } from './weapons-kpi';
import { components, engineerKpi30, observe } from './engineer-kpi';
import { duelOf, geometry, inFiringPosition, integrity } from './features';
import { helmsComponents, helmsScore30, observeHelms } from './helms-kpi';

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
 *   Position only, not validated against outcomes: `helms_score30` replaces it as the helms station score.
 * - `helms_score30`: demand-weighted mean of the helms score's terms over (t, t+30 s] (`helms-kpi.ts`);
 *   censored when the run ends first or nothing was demanded of the helm in the window.
 * - `engineer_kpi30`: mean engineer score K over (t, t+30 s] (`engineer-kpi.ts`).
 *
 * The weapons station score K_w is no label: it is read exactly from a run's events (`RunScore.weapons`).
 *
 * The tactical labels need the sidecar's `shot` and `damage` events: censored for a run
 * recorded without them, never imputed.
 */
export const LABELS = [
    'kill60',
    'damage30',
    'tactical45',
    'opportunity45',
    'conversion45',
    'helms10',
    'engineer_kpi30',
    'helms_score30',
] as const;
export type LabelName = (typeof LABELS)[number];

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
 * Tactical, weapons, engineer and helms labels of every frame of a run (by frame index), for the player
 * `playerId`. `weaponsEvents` false censors the tactical labels.
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
        engineer_kpi30: null as number | null,
        helms_score30: null as number | null,
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
    const flown = frames.flatMap((f, i) => {
        const o = observeHelms(f.t, f.saved, playerId);
        return o ? [{ i, o }] : [];
    });
    if (flown.length) {
        const score = helmsScore30(
            helmsComponents(
                flown.map((s) => s.o),
                events,
                playerId,
            ),
        );
        flown.forEach((s, j) => (out[s.i].helms_score30 = score[j]));
    }
    if (!weaponsEvents) return out;
    const tactical = frames.flatMap((f, i) => {
        const tf = observeTactical(f.t, f.saved, playerId);
        return tf ? [{ i, tf }] : [];
    });
    const tfs = tactical.map((x) => x.tf);
    const windows = tacticalSeries(tfs, events, playerId, TACTICAL_WEIGHTS);
    tactical.forEach(({ i }, j) => {
        const w = windows[j];
        if (w && w.T !== null) {
            out[i].tactical45 = clip01(w.T);
            out[i].opportunity45 = clip01(w.O);
            out[i].conversion45 = w.O > 1e-9 ? clip01(w.T / w.O) : null;
        }
    });
    return out;
}
