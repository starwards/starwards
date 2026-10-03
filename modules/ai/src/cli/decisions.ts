/**
 * How the brains of a recorded crew run decided, per control.
 *
 *   npm --prefix modules/ai run decisions -- --recording <x.sgr> [--low 10] [--md]
 *
 * `--low <n>` also lists the n least confident decisions with their time, to inspect in the game
 * state with `npm --prefix modules/server run analyze -- at --recording <x.sgr> --t <t>`.
 */
import { leastConfident, readDecisionLog, summarizeDecisions } from '../training/decision-log';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const recording = arg('recording');
if (!recording) {
    throw new Error('name the recording with --recording <path.sgr>');
}
const { decisions } = readDecisionLog(recording);
const summary = summarizeDecisions(decisions);
const low = arg('low') ? leastConfident(decisions, Number(arg('low'))) : [];
if (process.argv.includes('--md')) {
    const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '–');
    const lines = [
        '| station | control | decisions | fallbacks | mean confidence | p10 confidence | flips | choices |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const s of summary) {
        const choices = Object.entries(s.choices)
            .sort(([, a], [, b]) => b - a)
            .map(([c, n]) => `${c} ${n}`)
            .join(', ');
        lines.push(
            `| ${s.station} | ${s.control} | ${s.decisions} | ${s.fallbacks} | ${fmt(s.meanConfidence)} | ${fmt(s.p10Confidence)} | ${s.flips} | ${choices} |`,
        );
    }
    for (const d of low) {
        lines.push(`\n- ${d.t.toFixed(2)} s ${d.station}/${d.control}: ${d.choice} (${fmt(d.confidence!)})`);
    }
    process.stdout.write(lines.join('\n') + '\n');
} else {
    process.stdout.write(JSON.stringify({ summary, low }, null, 2) + '\n');
}
