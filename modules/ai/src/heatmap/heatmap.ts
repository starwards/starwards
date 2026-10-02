/**
 * Radar isochrone heatmaps: per cell of the ship's isochrone grid (`grid.ts`), the trained estimates
 * of where the opponent will be and what being there would be worth. Evaluates the exported artefact
 * (`models/<version>.json`, written by `modules/ai/ml/heatmap/train_heatmap.py`) without Python;
 * mirrors `predict_export` there, and `heatmap.spec.ts` checks parity.
 */
import { BAND_EDGES, CELLS, SECTORS, cellName, cellOfIndex } from './grid';
import { ExportedModel, evaluate } from '../scoring/model';
import { FRAME_FEATURE_NAMES, cellIdFeatures, frameInputs, positionCellFeatures, threatCellFeatures } from './inputs';

import { SavedGame } from '@starwards/core/internal';
import { findDuel } from '../scoring/features';
import v1 from './models/v1.json';

type CellModel = ExportedModel | { constant: number };

type TargetModel = (
    | { kind: 'per-cell'; models: CellModel[] }
    | { kind: 'grid'; model: ExportedModel }
    | { kind: 'binned'; by: 'current' | 'cell'; closingEdges: number[]; aspectEdges: number[]; table: number[][] }
) & { normalise?: boolean };

export const TARGETS = ['threat5', 'threat10', 'fire', 'danger', 'value'] as const;
type TargetName = (typeof TARGETS)[number];

interface HeatmapArtefact {
    version: string;
    created: string;
    frameFeatures: string[];
    grid: { sectors: number; bandEdges: number[] };
    targets: Record<TargetName, TargetModel>;
    fixture: Record<string, Record<string, unknown>>;
}

export const heatmapModel = v1 as unknown as HeatmapArtefact;

if (
    heatmapModel.frameFeatures.join('\n') !== FRAME_FEATURE_NAMES.join('\n') ||
    heatmapModel.grid.sectors !== SECTORS ||
    heatmapModel.grid.bandEdges.join() !== BAND_EDGES.join()
) {
    throw new Error(`heatmap ${heatmapModel.version} was trained on another grid or input list than grid.ts/inputs.ts`);
}

export interface HeatmapCell {
    readonly sector: number;
    readonly band: number;
    /** P(opponent in this cell 5 s / 10 s from now); each sums to 1 over the grid. */
    readonly threat5: number;
    readonly threat10: number;
    /** P(our blast hits the opponent within 10 s of entering this cell). */
    readonly fire: number;
    /** P(we are hit or lose integrity within 10 s of entering this cell). */
    readonly danger: number;
    /** Expected snapshot-scorer `overall.value` 10 s after entering this cell. */
    readonly value: number;
}

export interface Heatmap {
    readonly cells: HeatmapCell[];
    /** Opponent's current cell. */
    readonly current: number;
}

const evalCell = (m: CellModel, x: readonly number[]) => ('constant' in m ? m.constant : evaluate(m, x));
const digitize = (v: number, edges: readonly number[]) => edges.filter((e) => e <= v).length;

interface TargetInputs {
    readonly frame: readonly number[];
    /** Per-cell inputs (threat or position), CELLS rows. */
    readonly cells: readonly (readonly number[])[];
    readonly current: number;
    readonly closing: number;
    readonly aspect: number;
}

/** All cells of one target. */
export function predictTarget(model: TargetModel, x: TargetInputs): number[] {
    const out = Array.from({ length: CELLS }, (_, c) => {
        if (model.kind === 'binned') {
            const bin = digitize(x.closing, model.closingEdges) * 3 + digitize(x.aspect, model.aspectEdges);
            return model.by === 'current' ? model.table[x.current * 9 + bin][c] : model.table[c][bin];
        }
        if (model.kind === 'per-cell') return evalCell(model.models[c], [...x.frame, ...x.cells[c]]);
        return evaluate(model.model, [...x.frame, ...x.cells[c], ...cellIdFeatures(c)]);
    });
    if (!model.normalise) return out.map((v) => Math.min(1, Math.max(0, v)));
    const clipped = out.map((v) => Math.max(1e-6, v));
    const sum = clipped.reduce((s, v) => s + v, 0);
    return clipped.map((v) => v / sum);
}

/** The heatmap from the player ship's view (default the first player ship); `undefined` without a player and an opponent. */
export function heatmapAt(saved: SavedGame, playerId?: string, artefact = heatmapModel): Heatmap | undefined {
    const duel = findDuel(saved, playerId);
    if (!duel) return undefined;
    const f = frameInputs(duel);
    const closing = f.frame[FRAME_FEATURE_NAMES.indexOf('closing_speed')];
    const aspect = f.frame[FRAME_FEATURE_NAMES.indexOf('target_aspect')];
    const base = { frame: f.frame, current: f.current, closing, aspect };
    const position = positionCellFeatures(duel, f);
    const t = artefact.targets;
    const threat5 = predictTarget(t.threat5, { ...base, cells: threatCellFeatures(duel, f, 5) });
    const threat10 = predictTarget(t.threat10, { ...base, cells: threatCellFeatures(duel, f, 10) });
    const fire = predictTarget(t.fire, { ...base, cells: position });
    const danger = predictTarget(t.danger, { ...base, cells: position });
    const value = predictTarget(t.value, { ...base, cells: position });
    return {
        current: f.current,
        cells: Array.from({ length: CELLS }, (_, c) => ({
            ...cellOfIndex(c),
            threat5: threat5[c],
            threat10: threat10[c],
            fire: fire[c],
            danger: danger[c],
            value: value[c],
        })),
    };
}

const argmax = (xs: number[]) => xs.reduce((best, v, i) => (v > xs[best] ? i : best), 0);

/**
 * One-line reading of a heatmap for a brain or a crew member, e.g.
 * "enemy in 10 s likely ahead-right 5–15 s away (62%); best firing cell: behind 5–15 s (34%); most dangerous: ahead <5 s (40%)".
 */
export function describeHeatmap(map: Heatmap): string {
    const cells = map.cells;
    const sectorMass = Array.from({ length: SECTORS }, (_, s) =>
        cells.filter((c) => c.sector === s).reduce((sum, c) => sum + c.threat10, 0),
    );
    const s = argmax(sectorMass);
    const inSector = cells.filter((c) => c.sector === s);
    const band = inSector[argmax(inSector.map((c) => c.threat10))].band;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const where = `enemy in 10 s likely ${cellName({ sector: s, band })} away (${pct(sectorMass[s])})`;
    const fire = argmax(cells.map((c) => c.fire));
    const danger = argmax(cells.map((c) => c.danger));
    return `${where}; best firing cell: ${cellName(cells[fire])} (${pct(cells[fire].fire)}); most dangerous: ${cellName(cells[danger])} (${pct(cells[danger].danger)})`;
}
