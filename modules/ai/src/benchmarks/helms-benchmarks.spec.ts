import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { runBenchmark } from './run-benchmark';

/**
 * The helms benchmarks score the pilot's course only: neither ship carries ordnance, so no blast
 * knocks the quarry off its course or kills it before the run ends. Seed 5 of helms-intercept
 * crashed with "helms benchmark ships are missing" once a reference-weapons missile killed the quarry.
 */
describe('helms benchmarks fly unarmed ships', () => {
    let outDir: string;
    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helms-bench-'));
    });
    afterEach(() => rmDirRetrying(outDir));

    it('helms-intercept seed 5 runs to the end with the quarry alive', async () => {
        const result = await runBenchmark({
            benchmark: 'helms-intercept',
            brainPath: path.resolve(__dirname, '../../brains/helms.v1.json'),
            policy: 'reference',
            seed: 5,
            outDir,
            latencySeconds: 0.2,
        });
        expect(result.metrics.score).toBeGreaterThan(0);
    }, 120_000);
});
