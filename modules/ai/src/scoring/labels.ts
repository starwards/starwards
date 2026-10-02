import { SavedGame, ScanLevel } from '@starwards/core/internal';
import { duelOf, geometry, inFiringPosition, integrity, scanLevel, systemEffectiveness } from './features';

/**
 * Training targets for the snapshot scorer, read from the future of the same run. Definitions
 * (also in `docs/integration/ai-crew.md#snapshot-scoring`):
 *
 * - `kill60`: 1 if the target is gone (despawned or destroyed) at some frame in (t, t+60 s]; 0 if it
 *   is alive through t+60 s; censored (`null`) when the run ends before t+60 s with the target alive.
 * - `damage30`: drop of the player's `integrity` from t to t+30 s, clipped at 0 (0..1). Censored when
 *   the run ends first.
 * - `helms10`: share of the frames in (t, t+10 s] where the player is in firing position (gun band and
 *   nose line within 100 m of the target). Censored when the window is not complete (incl. a kill).
 * - `weapons10`: drop of the target's `integrity` from t to t+10 s (a dead target counts 0). Not censored
 *   by a kill; censored when the run ends first otherwise.
 * - `engineer30`: mean over (t, t+30 s] of (mean system effectiveness × (1 - share of systems starved)).
 *   Censored when the window is not complete.
 * - `signals30`: share of the scan gap on the target closed by t+30 s: (level(t+30) - level(t)) /
 *   (FULL - level(t)); 1 when already FULL. Censored when the window is not complete.
 */
export const LABELS = ['kill60', 'damage30', 'helms10', 'weapons10', 'engineer30', 'signals30'] as const;
export type LabelName = (typeof LABELS)[number];

/** What a label needs from one frame, with the duel pinned by ids so the target is followed into the future. */
interface FrameSummary {
    readonly t: number;
    readonly targetAlive: boolean;
    readonly playerIntegrity: number;
    readonly targetIntegrity: number;
    readonly firing: boolean;
    readonly engineer: number;
    readonly scan: number;
}

/** Summary of one frame for the duel `playerId` vs `targetId`; a missing ship counts as destroyed. */
export function summarize(t: number, saved: SavedGame, playerId: string, targetId: string): FrameSummary {
    const player = saved.fragment.ship.get(playerId);
    const target = saved.fragment.ship.get(targetId);
    const duel = duelOf(saved, playerId, targetId);
    const eff = player ? systemEffectiveness(player) : undefined;
    return {
        t,
        targetAlive: !!saved.fragment.space.getShip(targetId) && !saved.fragment.space.getShip(targetId)?.destroyed,
        playerIntegrity: player && saved.fragment.space.getShip(playerId) ? integrity(player) : 0,
        targetIntegrity: target && duel ? integrity(target) : 0,
        firing: duel ? inFiringPosition(geometry(duel)) : false,
        engineer: eff ? eff.mean * (1 - eff.starved) : 0,
        scan: duel ? scanLevel(duel) : ScanLevel.FULL,
    };
}

type Labels = Record<LabelName, number | null>;

/**
 * Labels for frame `i` of a run whose frames have all been summarised against frame i's duel
 * (`future[k]` = summary of frame k pinned to frame i's player/target ids; `future[i]` is frame i).
 */
export function labelsAt(future: readonly FrameSummary[], i: number): Labels {
    const now = future[i];
    const endT = future[future.length - 1].t;
    const window = (h: number) => future.slice(i + 1).filter((f) => f.t <= now.t + h + 1e-6);
    const complete = (h: number) => endT >= now.t + h - 1e-6;
    const lastIn = (h: number) => window(h).at(-1);

    const w60 = window(60);
    const killed = w60.some((f) => !f.targetAlive);
    const kill60 = killed ? 1 : complete(60) ? 0 : null;

    const at30 = complete(30) ? lastIn(30) : undefined;
    const damage30 = at30 ? Math.max(0, now.playerIntegrity - at30.playerIntegrity) : null;

    const w10 = window(10);
    const full10 = complete(10) && w10.every((f) => f.targetAlive);
    const helms10 = full10 && w10.length ? w10.filter((f) => f.firing).length / w10.length : null;
    const at10 = lastIn(10);
    const killedIn10 = w10.some((f) => !f.targetAlive);
    const weapons10 =
        killedIn10 || (complete(10) && at10)
            ? Math.max(0, now.targetIntegrity - (killedIn10 ? 0 : at10!.targetIntegrity))
            : null;

    const w30 = window(30);
    const engineer30 = complete(30) && w30.length ? w30.reduce((s, f) => s + f.engineer, 0) / w30.length : null;
    const full30 = complete(30) && w30.every((f) => f.targetAlive) && at30;
    const gap = ScanLevel.FULL - now.scan;
    const signals30 = full30 ? (gap <= 0 ? 1 : Math.max(0, at30.scan - now.scan) / gap) : null;

    return { kill60, damage30, helms10, weapons10, engineer30, signals30 };
}
