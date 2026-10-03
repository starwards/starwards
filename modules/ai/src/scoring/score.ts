import { FEATURE_NAMES, extractFeatures, findDuel } from './features';
import { ScorerArtefact, evaluate, featureSelector } from './model';

import { SavedGame } from '@starwards/core/internal';
import v1 from './models/v1.json';
import v2 from './models/v2.json';

/**
 * Snapshot score, every value in [0, 1], higher is better for the player unless noted. Three layers:
 *
 * - `overall.kill`: calibrated P(target is killed within 60 s).
 * - `overall.damage`: expected drop of the player's integrity (armor, systems, capsule) over 30 s; lower is better.
 * - `overall.value`: `kill × (1 - damage)`, a composition, not a trained target.
 * - `tactical.score`: expected tactical score T (threat-weighted incapacitation our hits deal, over its
 *   ceiling) over the next 45 s; shared by helms and weapons.
 * - `tactical.opportunity`: expected O, the share of those 45 s with a firing solution (helms' part of T).
 * - `tactical.conversion`: expected V = T / O where O > 0 (weapons' part of T).
 * - `stations.helms`: expected share of the next 10 s in firing position. Not validated against
 *   outcomes or policy orderings; where it and `tactical.opportunity` disagree, read the latter.
 * - `stations.weapons`: expected weapons station score K_w over the rounds of the next 30 s, over its ceiling 1.5.
 * - `stations.engineer`: expected engineer score K over the next 30 s.
 *
 * Signals has no station score: the recordings show the automatic scan queue's work, not the seat's
 * (#2307, #2308).
 *
 * Label definitions: `labels.ts`; protocol and metrics: `modules/ai/ml/README.md` and the report the
 * artefact's version was trained with.
 */
export interface SnapshotScore {
    readonly overall: { readonly kill: number; readonly damage: number; readonly value: number };
    readonly tactical: { readonly score: number; readonly opportunity: number; readonly conversion: number };
    readonly stations: { readonly helms: number; readonly weapons: number; readonly engineer: number };
}

/** Every exported artefact, by version; `v1` stays for regression comparison. */
export const scorers: Record<'v1' | 'v2', ScorerArtefact> = { v1: v1 as ScorerArtefact, v2: v2 as ScorerArtefact };

/**
 * The artefact `scoreSnapshot` reads for the tactical and station layers. The overall heads stay on v1:
 * v2 is strictly worse than v1 on some earlier scenarios (`modules/ai/ml/reports/2026-10-03-v2.md`).
 */
export const scorer = scorers.v2;
const overallScorer = scorers.v1;

const select = featureSelector(scorer, FEATURE_NAMES);
const selectOverall = featureSelector(overallScorer, FEATURE_NAMES);

/** Scores the frame from the player ship's view (`playerId`, default the first player ship); `undefined` without a player and an opponent. */
export function scoreSnapshot(saved: SavedGame, playerId?: string): SnapshotScore | undefined {
    const duel = findDuel(saved, playerId);
    if (!duel) return undefined;
    const features = extractFeatures(duel);
    const x = select(features);
    const at = (label: string) => evaluate(scorer.models[label], x);
    const xo = selectOverall(features);
    const kill = evaluate(overallScorer.models.kill60, xo);
    const damage = evaluate(overallScorer.models.damage30, xo);
    return {
        overall: { kill, damage, value: kill * (1 - damage) },
        tactical: { score: at('tactical45'), opportunity: at('opportunity45'), conversion: at('conversion45') },
        stations: { helms: at('helms10'), weapons: at('weapons_kw30'), engineer: at('engineer_kpi30') },
    };
}
