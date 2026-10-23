/**
 * When the GVTS's magazine capacity falls, from a recording: one line per drop (time, capacity, HE
 * missiles left), and the repairs running on the magazine. Diagnostic for the W-waves magazine study.
 *
 *   npm run magazine-timeline -- <x.sgr> [<y.sgr>...]
 */
import { streamFrames } from '../scoring/recording';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

async function main() {
    for (const file of process.argv.slice(2)) {
        let last = 1;
        const drops: string[] = [];
        for await (const { t, saved } of streamFrames(file)) {
            const ship = saved.fragment.ship.get(TRAINING_PLAYER_ID);
            if (!ship) continue;
            const cap = ship.magazine.capacity;
            if (Math.abs(cap - last) > 1e-6) {
                drops.push(`${t.toFixed(0)}s ${cap.toFixed(2)} he=${ship.magazine.getCount('HiExpMissile')}`);
                last = cap;
            }
        }
        process.stdout.write(`${file.split('/').pop()}: ${drops.join(' | ')}\n`);
    }
}

void main();
