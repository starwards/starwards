/**
 * The waves search's selection metric over paired `waves` results (`<scenario>-waves.json`, from
 * `cli/waves.ts` or the cluster eval queue). Scenario = file name.
 *
 *   npm --prefix modules/ai run composite -- calibrate --results <dir or file>... --crew <crew>... --idle idle [--out src/scoring/models/composite-weights.json]
 *   npm --prefix modules/ai run composite -- score --results <dir or file>... --baseline <crew> [--candidate <crew>...] [--weights src/scoring/models/composite-weights.json] [--pass-waves 3]
 *
 * calibrate: per component, the first `--crew` that played its scenario against `--idle` sets the
 * signal-to-noise weight. score: composite and components (95% paired bootstrap) and W-waves pass
 * non-inferiority of each candidate against the baseline.
 */
import {
    COMPOSITE_COMPONENTS,
    CompositeWeights,
    ScenarioRuns,
    calibrateWeights,
    compositeCompare,
    passNonInferiority,
} from '../scoring/composite-fitness';
import { WaveRun } from '../training/wave-compare';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_WEIGHTS = path.resolve(__dirname, '../scoring/models/composite-weights.json');

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

/** Every `<scenario>-waves.json` under the given files/directories, rows concatenated per scenario. */
function readResults(sources: readonly string[]): Record<string, WaveRun[]> {
    const files = sources.flatMap((s) =>
        fs.statSync(s).isDirectory()
            ? fs.readdirSync(s, { recursive: true, encoding: 'utf8' }).map((f) => path.join(s, f))
            : [s],
    );
    const runs: Record<string, WaveRun[]> = {};
    for (const f of files.filter((x) => x.endsWith('-waves.json'))) {
        const scenario = path.basename(f).replace(/-waves\.json$/, '');
        (runs[scenario] ??= []).push(...(JSON.parse(fs.readFileSync(f, 'utf8')) as WaveRun[]));
    }
    return runs;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(3));

function calibrate(runs: ScenarioRuns) {
    const crews = args('crew');
    const [idle = 'idle'] = args('idle');
    const components = COMPOSITE_COMPONENTS.map((c) => {
        const crew = crews.find((k) => runs[c.scenario]?.some((r) => r.crew === k));
        if (!crew) throw new Error(`no --crew played ${c.scenario}`);
        return { crew, ...calibrateWeights([c], runs, crew, idle).components[0] };
    });
    const total = components.reduce((a, c) => a + Math.max(0, c.snr), 0);
    const weights: CompositeWeights & { calibratedOn: string } = {
        crew: [...new Set(components.map((c) => c.crew))].join(','),
        idle,
        calibratedOn: new Date().toISOString().slice(0, 10),
        components: components.map(({ crew: _, ...c }) => ({ ...c, weight: Math.max(0, c.snr) / total })),
    };
    const [out = DEFAULT_WEIGHTS] = args('out');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(weights, null, 4) + '\n');
    const lines = [
        `| component | crew vs ${idle} | seeds | sigma | SNR | weight |`,
        '| --- | --- | --- | --- | --- | --- |',
        ...components.map(
            (c, i) =>
                `| ${c.name} | ${c.crew} | ${c.seeds} | ${fmt(c.sigma)} | ${c.snr.toFixed(2)} | ${weights.components[i].weight.toFixed(3)} |`,
        ),
    ];
    process.stdout.write(`${lines.join('\n')}\n\nweights: ${out}\n`);
}

function score(runs: ScenarioRuns) {
    const [file = DEFAULT_WEIGHTS] = args('weights');
    const weights = JSON.parse(fs.readFileSync(file, 'utf8')) as CompositeWeights;
    const [baseline] = args('baseline');
    if (!baseline) throw new Error('score needs --baseline <crew>');
    const all = [...new Set(Object.values(runs).flatMap((rows) => rows.map((r) => r.crew)))];
    const candidates = args('candidate').length ? args('candidate') : all.filter((c) => c !== baseline);
    const passWaves = Number(args('pass-waves')[0] ?? 3);
    const lines = ['| candidate | component | Δ (better > 0) | 95% paired bootstrap |', '| --- | --- | --- | --- |'];
    const passLines: string[] = [];
    for (const candidate of candidates) {
        const r = compositeCompare(weights, runs, baseline, candidate);
        for (const c of r.components) {
            lines.push(`| ${candidate} | ${c.name} | ${fmt(c.estimate)} | [${fmt(c.ci[0])}, ${fmt(c.ci[1])}] |`);
        }
        const [lo, hi] = r.composite.ci;
        lines.push(`| ${candidate} | **composite** | **${fmt(r.composite.estimate)}** | [${fmt(lo)}, ${fmt(hi)}] |`);
        if (runs['W-waves']) {
            const p = passNonInferiority(runs['W-waves'], baseline, candidate, passWaves);
            passLines.push(
                `- ${candidate}: passes ${p.candPasses}/${p.seeds} vs ${p.basePasses}/${p.seeds}; worse on ${p.worse}, better on ${p.better} (max worse ${p.maxWorse}) → ${p.nonInferior ? 'non-inferior' : 'INFERIOR'}`,
            );
        }
    }
    process.stdout.write(
        [
            `# Composite vs ${baseline} (weights ${file})`,
            '',
            ...lines,
            '',
            ...(passLines.length ? ['W-waves pass:', ...passLines] : []),
        ].join('\n') + '\n',
    );
}

const [command] = process.argv.slice(2);
const runs = readResults(args('results'));
if (command === 'calibrate') calibrate(runs);
else if (command === 'score') score(runs);
else throw new Error('usage: composite calibrate|score --results <dir or file>... (see the file header)');
