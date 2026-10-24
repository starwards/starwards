/**
 * ERRAND-PLAN step 1 extractor: per-frame station capsule/hull, raiders near each station, and the
 * GVTS's HE stock, one JSON line per recording. Aggregation (calibration, TTD error, deficit AUC)
 * lives in errand-check-stats.mjs.
 *
 *   npm run errand-check -- <x.sgr> [<y.sgr>...] > rows.jsonl
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { streamFrames } from '../scoring/recording';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

const STATIONS = ['station-large', 'station-platform', 'station-small'];
const RANGES = [5000, 8000];

// per-hit damage on stations from the `.events.jsonl.zst` sidecar: [t, station, amount, plateLoss]
async function stationHits(sgr: string) {
    const side = sgr.replace(/\.sgr$/, '.events.jsonl.zst');
    const hits: [number, string, number, number][] = [];
    if (!existsSync(side)) return null;
    const z = spawn('zstd', ['-dc', side]);
    for await (const line of createInterface({ input: z.stdout })) {
        if (!line.includes('"kind":"damage"')) continue;
        const e = JSON.parse(line) as { t: number; objectId: string; data: { amount: number; plateLoss: number } };
        if (STATIONS.includes(e.objectId))
            hits.push([+e.t.toFixed(2), e.objectId, e.data.amount, +e.data.plateLoss.toFixed(1)]);
    }
    return hits;
}

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
                let ah = 0,
                    am = 0;
                for (const pl of s.armor.armorPlates)
                    for (const l of pl.layers) {
                        ah += l.health;
                        am += l.maxHealth;
                    }
                st[id] = {
                    cap: +s.capsule.integrity.toFixed(3),
                    hr: +s.healthRatio.toFixed(3),
                    near,
                    ah: +ah.toFixed(1),
                    am,
                    ab: +(1 - s.armor.numberOfHealthyPlates / s.armor.numberOfPlates).toFixed(3),
                };
            }
            const p = saved.fragment.ship.get(TRAINING_PLAYER_ID);
            frames.push({
                t: +t.toFixed(2),
                st,
                he: p ? [p.magazine.getCount('HiExpMissile'), p.magazine.getCount('HiExpShell')] : null,
                enemies: enemies.map((e) => [`g${e.chainGuns.length}t${e.tubes.length}`, +e.healthRatio.toFixed(2)]),
            });
        }
        process.stdout.write(JSON.stringify({ file: file.split('/').pop(), frames, hits: await stationHits(file) }) + '\n');
    }
}

void main();
