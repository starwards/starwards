/**
 * Scores a brain by how often it chooses what the reference policy chooses, on the displays recorded
 * in crew runs, without running the game.
 *
 *   npm run agree -- --recording <x.sgr | folder> [--recording ...] --station helms [--brain brains/helms.v12.json [--policy jev|idle]] [--reach 5000] [--limit n] [--md]
 *
 * Without `--brain` it scores the brain that played each run, from its recorded decisions, and costs
 * nothing. With `--brain` that brain is asked every recorded display of its station (Jev answers
 * come from the answer cache when it holds them: `--no-cache`, `--cache-dir <dir>`); `--limit` asks
 * only the first n decisions of each run. A folder stands for every recording under it. `--reach`
 * cuts the recorded radar to that many metres for both, for runs recorded before station radars were
 * cut to their reach (helms 5000, weapons 10000). The reference plays helms and weapons only.
 */
import { BrainSpec, loadBrainSpec } from '../brain/spec';
import { StudentChoices, agreementSummary, recordedChoices, teacherAgreement } from '../training/agree';
import { answerCacheFromEnv, applyCacheFlags, meteredJevClient } from '../brain/jev-cache';
import { idlePolicy, jevPolicy } from '../brain/policies';

import { Policy } from '../brain/brain';
import { buildRequest } from '../brain/request';
import fs from 'node:fs';
import { jevClient } from '../brain/jev-client';
import path from 'node:path';
import { readDecisionLog } from '../training/decision-log';
import { verbalReader } from '../brain/verbal';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function recordingsUnder(target: string): string[] {
    if (!fs.statSync(target).isDirectory()) return [target];
    return fs
        .readdirSync(target, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.sgr'))
        .sort()
        .map((f) => path.join(target, f));
}

/** Asks `spec` each recorded display, as `reask` does; a fresh verbal reader per run. */
function askedChoices(spec: BrainSpec, policy: Policy): StudentChoices {
    const read = spec.view === 'verbal' ? verbalReader(spec.decisionSeconds) : undefined;
    return async (recorded, controls, display) => {
        const request = buildRequest(spec, display, controls, read?.(display), recorded.heard);
        const { answers } = await policy.answer(request, controls, display);
        return new Map(Object.entries(answers).map(([control, answer]) => [control, answer.choice]));
    };
}

async function main() {
    applyCacheFlags();
    const recordings = process.argv
        .flatMap((a, i) => (a === '--recording' ? [process.argv[i + 1]] : []))
        .flatMap(recordingsUnder);
    const brain = arg('brain');
    const spec = brain ? loadBrainSpec(brain) : undefined;
    const station = spec?.station ?? arg('station');
    if (!recordings.length || !station) {
        throw new Error(
            'usage: agree --recording <x.sgr | folder> [--recording ...] (--station <station> | --brain <brain.json>)',
        );
    }
    const jev = spec && arg('policy') !== 'idle' ? meteredJevClient(jevClient(), answerCacheFromEnv()) : undefined;
    const reach = arg('reach') === undefined ? undefined : Number(arg('reach'));
    const limit = Number(arg('limit') ?? Infinity);
    const samples = [];
    for (const recording of recordings) {
        const { requests, decisions } = readDecisionLog(recording);
        const mine = requests.filter((r) => r.station === station).slice(0, limit);
        const student = spec ? askedChoices(spec, jev ? jevPolicy(spec, jev) : idlePolicy) : recordedChoices(decisions);
        samples.push(...(await teacherAgreement(mine, student, reach)));
    }
    const summary = agreementSummary(samples);
    if (process.argv.includes('--md')) {
        const pct = (n: number) => (Number.isFinite(n) ? `${(100 * n).toFixed(0)}%` : '–');
        const lines = [
            '| control | decisions | agreement | reference acts | agreement where it acts | agreement where it rests |',
            '| --- | --- | --- | --- | --- | --- |',
            ...summary.map(
                (r) =>
                    `| ${r.control} | ${r.decisions} | ${pct(r.agreement)} | ${r.acts} | ${pct(r.actAgreement)} | ${pct(r.restAgreement)} |`,
            ),
        ];
        process.stdout.write(lines.join('\n') + '\n');
    } else {
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    }
    if (jev) {
        process.stderr.write(`jev: ${JSON.stringify(jev.usage)}\n`);
    }
}

void main();
