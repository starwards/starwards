/**
 * The cluster's paired eval queue (`cluster/eval-queue.ts`) from the shell.
 *
 *   npm --prefix modules/ai run eval-queue -- submit --crew crews/a.json --crew crews/b.json --scenarios W-waves,W-cut-intercept,W-cut-lof [--bank tuning|held-out | --first-seed 1001 --seeds 16] [--label x] [--image <ref>] [--timeout s] [--workers 4]
 *   npm --prefix modules/ai run eval-queue -- status <job>...
 *   npm --prefix modules/ai run eval-queue -- collect <job>... --out <dir> [--wait]
 *
 * submit prints the Job name. collect writes `<dir>/<scenario>-waves.json` per scenario, the input
 * of `waves --results` and `composite score --results`.
 */
import { HELD_OUT_SEEDS, TUNING_SEEDS } from '../training/seed-banks';
import { collect, status, submit } from '../cluster/eval-queue';
import fs from 'node:fs';
import path from 'node:path';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function args(name: string) {
    return process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
}

const positional = () => {
    const rest = process.argv.slice(3);
    return rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
};

const [command] = process.argv.slice(2);
if (command === 'submit') {
    const bank = arg('bank') === 'held-out' ? HELD_OUT_SEEDS : TUNING_SEEDS;
    const { job } = submit({
        crews: args('crew').map((c) => path.resolve(c)),
        scenarios: (arg('scenarios') ?? 'W-waves').split(','),
        firstSeed: Number(arg('first-seed') ?? bank.first),
        seeds: Number(arg('seeds') ?? bank.count),
        label: arg('label'),
        image: arg('image'),
        timeoutSeconds: arg('timeout') ? Number(arg('timeout')) : undefined,
        workers: arg('workers') ? Number(arg('workers')) : undefined,
    });
    process.stdout.write(`${job}\n`);
} else if (command === 'status') {
    for (const job of positional()) process.stdout.write(`${JSON.stringify(status(job))}\n`);
} else if (command === 'collect') {
    const out = path.resolve(arg('out') ?? '.');
    const { runs, pending, failed } = collect(positional(), { wait: process.argv.includes('--wait') });
    fs.mkdirSync(out, { recursive: true });
    for (const [scenario, rows] of Object.entries(runs)) {
        const file = path.join(out, `${scenario}-waves.json`);
        fs.writeFileSync(file, JSON.stringify(rows, null, 2));
        process.stdout.write(`${file}: ${rows.length} rows\n`);
    }
    if (pending.length) process.stdout.write(`still running: ${pending.join(' ')}\n`);
    if (failed.length) process.stdout.write(`with failed shards (rows missing): ${failed.join(' ')}\n`);
} else {
    throw new Error('usage: eval-queue submit|status|collect (see the file header)');
}
