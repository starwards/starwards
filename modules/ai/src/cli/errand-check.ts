/**
 * ERRAND-PLAN step 1 extractor: per-frame station capsule/hull, raiders near each station, and the
 * GVTS's HE stock, one JSON line per recording. Aggregation (calibration, TTD error, deficit AUC)
 * lives in errand-check-stats.mjs.
 *
 *   npm run errand-check -- <x.sgr> [<y.sgr>...] > rows.jsonl
 */
import { streamFrames } from '../scoring/recording';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

const STATIONS = ['station-large', 'station-platform', 'station-small'];
const RANGES = [5000, 8000];

async function main() {
    for (const file of process.argv.slice(2)) {
        const frames: unknown[] = [];
        for await (const { t, saved } of streamFrames(file)) {
            const ships = [...saved.fragment.ship.values()];
            const enemies = ships.filter((s) => !STATIONS.includes(s.id) && s.id !== TRAINING_PLAYER_ID);
            const st: Record<string, unknown> = {};
            for (const id of STATIONS) {
                const s = ships.find((x) => x.id === id);
                if (!s) continue;
                const near = RANGES.map((r) => {
                    const by: Record<string, number> = {};
                    for (const e of enemies) {
                        if (
                            Math.hypot(
                                e.spaceship.position.x - s.spaceship.position.x,
                                e.spaceship.position.y - s.spaceship.position.y,
                            ) <= r
                        ) {
                            const k = `g${e.chainGuns.length}t${e.tubes.length}`;
                            by[k] = (by[k] ?? 0) + 1;
                        }
                    }
                    return by;
                });
                st[id] = { cap: +s.capsule.integrity.toFixed(3), hr: +s.healthRatio.toFixed(3), near };
            }
            const p = saved.fragment.ship.get(TRAINING_PLAYER_ID);
            frames.push({
                t: +t.toFixed(2),
                st,
                he: p ? [p.magazine.getCount('HiExpMissile'), p.magazine.getCount('HiExpShell')] : null,
                enemies: enemies.map((e) => [`g${e.chainGuns.length}t${e.tubes.length}`, +e.healthRatio.toFixed(2)]),
            });
        }
        process.stdout.write(JSON.stringify({ file: file.split('/').pop(), frames }) + '\n');
    }
}

void main();
