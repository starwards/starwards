/**
 * Prints the heatmaps of one recording frame as ASCII polar maps (nose up, rings = time bands, not
 * distance) and the one-line reading.
 *
 *   npm --prefix modules/ai run heatmap -- --recording <x.sgr> --t <seconds> [--ship GVTS]
 */
import { BANDS, BAND_NAMES, SECTORS, SECTOR_NAMES } from './grid';
import { Heatmap, HeatmapCell, describeHeatmap, heatmapAt, heatmapModel } from './heatmap';
import { readFrames } from '../scoring/recording';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const SHADES = ' .:-=+*#%@';
const W = 33;
const H = 17;

/** Polar map of one field: each character is shaded by the value of the cell under it. */
function polar(map: Heatmap, field: keyof Omit<HeatmapCell, 'sector' | 'band'>, max: number) {
    const lines: string[] = [];
    for (let row = 0; row < H; row++) {
        let line = '';
        for (let col = 0; col < W; col++) {
            const x = (col - (W - 1) / 2) / ((W - 1) / 2);
            const y = ((H - 1) / 2 - row) / ((H - 1) / 2);
            const r = Math.hypot(x, y);
            if (r < 0.12) {
                line += row === (H - 1) / 2 && col === (W - 1) / 2 ? '^' : ' ';
                continue;
            }
            if (r > 1) {
                line += ' ';
                continue;
            }
            const band = Math.min(BANDS - 1, Math.floor(((r - 0.12) / 0.88) * BANDS));
            const off = (Math.atan2(x, y) * 180) / Math.PI; // clockwise from up = right of the nose
            const sector = ((Math.round(off / (360 / SECTORS)) % SECTORS) + SECTORS) % SECTORS;
            const c = sector * BANDS + band;
            const v = map.cells[c][field] / (max || 1);
            line +=
                c === map.current && field.startsWith('threat') && v < 0.5
                    ? 'T'
                    : SHADES[Math.min(SHADES.length - 1, Math.round(v * (SHADES.length - 1)))];
        }
        lines.push(line);
    }
    return lines;
}

async function main() {
    const recording = arg('recording');
    const t = Number(arg('t') ?? 0);
    if (!recording) throw new Error('usage: heatmap --recording <path.sgr> --t <seconds> [--ship <id>]');
    const frames = await readFrames(recording);
    const frame = frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), frames[0]);
    const map = heatmapAt(frame.saved, arg('ship'));
    if (!map) {
        process.stdout.write(`t=${frame.t.toFixed(1)}: no player or no opponent\n`);
        return;
    }
    const fields = ['threat10', 'fire', 'danger', 'value'] as const;
    const maps = fields.map((f) => polar(map, f, Math.max(...map.cells.map((c) => c[f]))));
    process.stdout.write(
        `heatmap ${heatmapModel.version}, t=${frame.t.toFixed(1)} s; nose up, rings ${BAND_NAMES.join(' | ')}; shade = value / map max; T = enemy now\n\n`,
    );
    process.stdout.write(fields.map((f) => f.padEnd(W + 3)).join('') + '\n');
    for (let row = 0; row < H; row++) process.stdout.write(maps.map((m) => m[row] + '   ').join('') + '\n');
    process.stdout.write(`\n${'cell'.padEnd(24)}threat5 threat10   fire danger  value\n`);
    for (const c of map.cells) {
        const pct = (v: number) => v.toFixed(2).padStart(7);
        process.stdout.write(
            `${`${SECTOR_NAMES[c.sector]} ${BAND_NAMES[c.band]}`.padEnd(24)}${pct(c.threat5)}${pct(c.threat10)}${pct(c.fire)}${pct(c.danger)}${pct(c.value)}\n`,
        );
    }
    process.stdout.write(`\n${describeHeatmap(map)}\n`);
}

void main();
