/**
 * NPC vs PC parity report (M4.65, S0 of the NPC AI design): the same hull, as an NPC and as a PC ship,
 * through scripted situations; every Target Details readout where they differ.
 *
 *   npm --prefix modules/ai run parity -- --out <dir>
 *
 * Prints the markdown report and writes `<out>/parity.md` and `<out>/parity.json` (default: the
 * working directory). The committed copies live in `curriculum/adversary/`.
 */
import { parityMarkdown, runParity } from '../adversary/parity';

import fs from 'node:fs';
import path from 'node:path';

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const out = path.resolve(arg('out', '.'));
const report = runParity();
const markdown = parityMarkdown(report);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'parity.md'), markdown);
process.stdout.write(`${markdown}\nreport: ${path.join(out, 'parity.md')}\n`);
