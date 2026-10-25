/**
 * Depth meter report for one question: arms (pure / blind / informed / control) from finished
 * `waves` results, unpaired, with arm sizing, the success check and the golden-rule check
 * (`training/meter.ts`).
 *
 *   npm --prefix modules/ai run meter -- --question "dock or hold?" --arm never=pure=<out>/W-waves-waves.json#crew-a --arm fixed=pure=<out2>/W-waves-waves.json --arm guard=control=<out3>/W-waves-waves.json [--margin 5] [--out report.md]
 *
 * `--arm <name>=<role>=<results.json>[#<crew>]` may repeat; the same name given twice pools both
 * files. `#<crew>` keeps only that crew's rows of a file that holds several.
 */
import { ArmRole, MeterArm, meterReport } from '../training/meter';
import { WaveRun } from '../training/wave-compare';
import fs from 'node:fs';
import path from 'node:path';

const ROLES: readonly ArmRole[] = ['pure', 'blind', 'informed', 'control'];

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

function loadArms(specs: string[]): MeterArm[] {
    const arms = new Map<string, MeterArm>();
    for (const spec of specs) {
        const [name, role, source] = spec.split('=');
        if (!ROLES.includes(role as ArmRole) || !source) {
            throw new Error(`--arm ${spec}: expected <name>=<${ROLES.join('|')}>=<results.json>[#crew]`);
        }
        const [file, crew] = source.split('#');
        const rows = (JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as WaveRun[]).filter(
            (r) => !crew || r.crew === crew,
        );
        const arm = arms.get(name) ?? { name, role: role as ArmRole, runs: [] };
        arms.set(name, { ...arm, runs: [...arm.runs, ...rows] });
    }
    return [...arms.values()];
}

function main() {
    const arms = loadArms(args('arm'));
    if (!arms.length) throw new Error('usage: meter --question <text> --arm <name>=<role>=<results.json>[#crew] ...');
    const [margin = '5'] = args('margin');
    const text = meterReport(args('question')[0] ?? 'unnamed question', arms, { marginPp: Number(margin) });
    const [out] = args('out');
    if (out) fs.writeFileSync(path.resolve(out), text);
    process.stdout.write(text);
}

main();
