import { FEATURE_NAMES, extractFeatures, findDuel } from './features';
import { ScorerArtefact, evaluate } from './model';

import { SavedGame } from '@starwards/core/internal';
import v1 from './models/v1.json';

/**
 * Snapshot score, every value in [0, 1], higher is better for the player:
 *
 * - `overall.kill`: calibrated P(target is killed within 60 s).
 * - `overall.damage`: expected drop of the player's integrity (armor, systems, capsule) over 30 s; lower is better.
 * - `overall.value`: `kill × (1 - damage)`, a composition, not a trained target.
 * - `stations.helms`: expected share of the next 10 s in firing position.
 * - `stations.weapons`: expected drop of the target's integrity over the next 10 s.
 * - `stations.engineer`: expected mean of (system effectiveness × not starved) over the next 30 s.
 * - `stations.signals`: expected share of the remaining scan gap on the target closed within 30 s.
 *
 * Label definitions: `labels.ts`; protocol and metrics: `modules/ai/ml/README.md` and the report the
 * artefact's version was trained with.
 */
export interface SnapshotScore {
    readonly overall: { readonly kill: number; readonly damage: number; readonly value: number };
    readonly stations: {
        readonly helms: number;
        readonly weapons: number;
        readonly engineer: number;
        readonly signals: number;
    };
}

export const scorer: ScorerArtefact = v1 as ScorerArtefact;

if (scorer.features.join('\n') !== FEATURE_NAMES.join('\n')) {
    throw new Error(`scorer ${scorer.version} was trained on a different feature list than features.ts`);
}

/** Scores the frame from the player ship's view (`playerId`, default the first player ship); `undefined` without a player and an opponent. */
export function scoreSnapshot(saved: SavedGame, playerId?: string): SnapshotScore | undefined {
    const duel = findDuel(saved, playerId);
    if (!duel) return undefined;
    const x = extractFeatures(duel);
    const at = (label: string) => evaluate(scorer.models[label], x);
    const kill = at('kill60');
    const damage = at('damage30');
    return {
        overall: { kill, damage, value: kill * (1 - damage) },
        stations: {
            helms: at('helms10'),
            weapons: at('weapons10'),
            engineer: at('engineer30'),
            signals: at('signals30'),
        },
    };
}
