import { CELLS, Mover, SECTORS, cellCentres, cellIndex, cellOf, cellOfIndex, moverOf } from './grid';
import { Duel, geometry, integrity } from '../scoring/features';
import { XY } from '@starwards/core/internal';

/**
 * Model inputs of the heatmaps, limited to what a station displays (fog of war). Each frame feature
 * names the station screen that shows it; the heatmap docs (`docs/integration/ai-crew.md#radar-heatmaps`)
 * render this list. Everything is in the ship's frame (nose = +x), so the maps rotate with the ship.
 */
interface FrameFeature {
    readonly name: string;
    /** Station screen that displays the quantity. */
    readonly shownOn: string;
    readonly value: (d: Duel, m: Mover) => number;
}

const local = (m: Mover, v: XY) => XY.rotate(v, -m.angle);
const sight = (d: Duel) => XY.difference(d.targetBody.position, d.playerBody.position);
const relVel = (d: Duel) => XY.difference(d.targetBody.velocity, d.playerBody.velocity);

const FRAME_FEATURES: readonly FrameFeature[] = [
    { name: 'range_km', shownOn: 'radar (helms, weapons, signals)', value: (d) => XY.lengthOf(sight(d)) / 1000 },
    {
        name: 'bearing_cos',
        shownOn: 'radar',
        value: (d, m) => Math.cos(Math.atan2(local(m, sight(d)).y, local(m, sight(d)).x)),
    },
    {
        name: 'bearing_sin',
        shownOn: 'radar',
        value: (d, m) => Math.sin(Math.atan2(local(m, sight(d)).y, local(m, sight(d)).x)),
    },
    {
        name: 'target_seconds',
        shownOn: 'derived from radar + own design (helms)',
        value: (d, m) => cellOf(m, d.targetBody.position).seconds / 60,
    },
    { name: 'rel_vel_fwd', shownOn: 'radar velocity vector', value: (d, m) => local(m, relVel(d)).x / 1000 },
    { name: 'rel_vel_side', shownOn: 'radar velocity vector', value: (d, m) => local(m, relVel(d)).y / 1000 },
    { name: 'closing_speed', shownOn: 'radar / weapons', value: (d) => geometry(d).closingSpeed / 1000 },
    { name: 'target_speed', shownOn: 'radar velocity vector', value: (d) => XY.lengthOf(d.targetBody.velocity) / 1000 },
    { name: 'target_aspect', shownOn: 'radar (target heading)', value: (d) => geometry(d).offTail / 180 },
    { name: 'own_vel_fwd', shownOn: 'helms speed readout', value: (d, m) => local(m, d.playerBody.velocity).x / 1000 },
    { name: 'own_vel_side', shownOn: 'helms speed readout', value: (d, m) => local(m, d.playerBody.velocity).y / 1000 },
    { name: 'turn_rate', shownOn: 'helms turn readout', value: (d) => d.playerBody.turnSpeed / 100 },
    { name: 'own_integrity', shownOn: 'engineer / armor screens', value: (d) => integrity(d.player) },
    {
        name: 'own_shells',
        shownOn: 'weapons ammo readout',
        value: (d) => {
            const mag = d.player.magazine as unknown as Record<string, number> & { design: Record<string, number> };
            const kinds = ['HiExpShell', 'ArmPenShell', 'FragShell'];
            const max = kinds.reduce((s, k) => s + (mag.design[`max_${k}`] ?? 0), 0);
            return max > 0 ? kinds.reduce((s, k) => s + (mag[`count_${k}`] ?? 0), 0) / max : 0;
        },
    },
];

export const FRAME_FEATURE_NAMES = FRAME_FEATURES.map((f) => f.name);

export const POSITION_CELL_FEATURE_NAMES = ['centre_range_km', 'centre_aim_off', 'centre_in_band'] as const;

interface FrameInputs {
    readonly mover: Mover;
    readonly frame: number[];
    readonly centres: XY[];
    /** Target's cell now. */
    readonly current: number;
}

export function frameInputs(d: Duel): FrameInputs {
    const mover = moverOf(d.player, d.playerBody);
    return {
        mover,
        frame: FRAME_FEATURES.map((f) => f.value(d, mover)),
        centres: cellCentres(mover),
        current: cellIndex(cellOf(mover, d.targetBody.position)),
    };
}

export function cellIdFeatures(cell: number) {
    const { sector, band } = cellOfIndex(cell);
    const a = (sector * 2 * Math.PI) / SECTORS;
    return [Math.cos(a), Math.sin(a), ...[0, 1, 2, 3].map((b) => (b === band ? 1 : 0))];
}

/** Threat per-cell inputs for every cell, horizon `seconds`. */
export function threatCellFeatures(d: Duel, f: FrameInputs, seconds: number): number[][] {
    const drift = XY.add(d.targetBody.position, XY.scale(d.targetBody.velocity, seconds));
    const driftCell = cellIndex(cellOf(f.mover, drift));
    return Array.from({ length: CELLS }, (_, c) => [
        c === f.current ? 1 : 0,
        c === driftCell ? 1 : 0,
        Math.log1p(XY.lengthOf(XY.difference(f.centres[c], drift)) / 1000),
    ]);
}

/** Position per-cell inputs for every cell: from the cell centre, range to the target, aim off the current heading, gun band. */
export function positionCellFeatures(d: Duel, f: FrameInputs): number[][] {
    return f.centres.map((p) => {
        const s = XY.difference(d.targetBody.position, p);
        const range = XY.lengthOf(s);
        const off = Math.abs(((((XY.angleOf(s) - f.mover.angle) % 360) + 540) % 360) - 180);
        return [range / 1000, off / 180, range >= 500 && range <= 3000 ? 1 : 0];
    });
}
