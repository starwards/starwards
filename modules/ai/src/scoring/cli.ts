/**
 * Prints the snapshot score series of a recording, one line per frame.
 *
 *   npm --prefix modules/ai run score -- --recording <x.sgr> [--every 5] [--ship GVTS]
 */
import { scoreSnapshot, scorer } from './score';
import { readFrames } from './recording';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
    const recording = arg('recording');
    if (!recording) throw new Error('usage: score --recording <path.sgr> [--every <seconds>] [--ship <id>]');
    const every = Number(arg('every') ?? 1);
    const f = (v: number) => v.toFixed(2).padStart(6);
    process.stdout.write(`scorer ${scorer.version}\n     t   kill damage  value  helms weapons engineer signals\n`);
    let next = 0;
    for (const { t, saved } of await readFrames(recording)) {
        if (t + 1e-6 < next) continue;
        next = t + every;
        const s = scoreSnapshot(saved, arg('ship'));
        process.stdout.write(
            s
                ? `${t.toFixed(0).padStart(6)}${f(s.overall.kill)} ${f(s.overall.damage)}${f(s.overall.value)}${f(s.stations.helms)}  ${f(s.stations.weapons)}   ${f(s.stations.engineer)}  ${f(s.stations.signals)}\n`
                : `${t.toFixed(0).padStart(6)}  (no player or no opponent)\n`,
        );
    }
}

void main();
