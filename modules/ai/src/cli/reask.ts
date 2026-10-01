/**
 * Re-asks a recorded crew run's questions with another brain, without running the game.
 *
 *   npm --prefix modules/ai run reask -- --recording <x.sgr> --brain brains/helms.v2.json [--policy jev|reference]
 *
 * Prints, per control, agreement with the recorded decisions and the confidence before and after.
 */
import { idlePolicy, jevPolicy } from '../brain/policies';
import { reask, reaskSummary } from '../training/reask';

import { jevClient } from '../brain/jev-client';
import { loadBrainSpec } from '../brain/spec';
import { readDecisionLog } from '../training/decision-log';
import { referencePolicy } from '../brain/reference-policy';

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
    const recording = arg('recording');
    const brain = arg('brain');
    if (!recording || !brain) {
        throw new Error('usage: reask --recording <path.sgr> --brain <brain.json> [--policy jev|reference|idle]');
    }
    const spec = loadBrainSpec(brain);
    const policyName = arg('policy', 'jev');
    const policy =
        policyName === 'jev' ? jevPolicy(spec, jevClient()) : policyName === 'reference' ? referencePolicy : idlePolicy;
    const { requests, decisions } = readDecisionLog(recording);
    const rows = await reask(spec, policy, requests, decisions);
    process.stdout.write(JSON.stringify(reaskSummary(rows), null, 2) + '\n');
}

void main();
