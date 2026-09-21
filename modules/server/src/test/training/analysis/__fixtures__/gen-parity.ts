import * as os from 'node:os';
import * as path from 'node:path';

import { runTraining, trainingScenarios } from '../../training-scenarios';

/**
 * Regenerates `t0-seed1-parity.json`. Run manually (not part of the test suite) whenever the
 * inline `TrainingResult` computation changes and the fixture needs recapturing.
 *
 * 60 sim-seconds, not the full 300 s corpus run: long enough to see armor fully stripped
 * (T0 seed 1 strips at ~t=47s) while keeping the tick-exact (0.1 s interval) recording small
 * enough for `extract.spec.ts` to ingest quickly.
 */
async function main() {
    const dir = path.join(os.tmpdir(), 'starwards-parity-fixture');
    const result = await runTraining(trainingScenarios.T0, {
        seed: 1,
        timeoutSeconds: 60,
        recording: { dir, intervalSimSeconds: 0.1 },
    });
    process.stdout.write(JSON.stringify(result, null, 2));
}
void main();
