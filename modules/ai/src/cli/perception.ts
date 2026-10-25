/**
 * What faction-only perception (ruling Q4) would give wave raiders spawning 140 km out (M4.65, S0 of
 * the NPC AI design): per hull, how often and how near a raider gets contact and a scan lock on the
 * station it is ordered to attack.
 *
 *   npm --prefix modules/ai run perception -- --seeds 4 --seconds 1500 --out <dir>
 *
 * Prints the markdown report and writes `<out>/perception.md` and `<out>/perception.json`.
 */
import { measureWavePerception, perceptionMarkdown } from '../adversary/perception';

import fs from 'node:fs';
import path from 'node:path';

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const seeds = Number(arg('seeds', '4'));
const firstSeed = Number(arg('first-seed', '1'));
const seconds = Number(arg('seconds', '1500'));
const out = path.resolve(arg('out', '.'));
const runs = Array.from({ length: seeds }, (_, i) => measureWavePerception(firstSeed + i, seconds));
const markdown = perceptionMarkdown(runs);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'perception.json'), `${JSON.stringify(runs, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'perception.md'), markdown);
process.stdout.write(`${markdown}\nreport: ${path.join(out, 'perception.md')}\n`);
