import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Store, ingest } from './store';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../../scenarios/training';
import { runTraining, trainingScenarios } from '../training-scenarios';

import { computeChecks } from './checks';
import { computeEvents } from './events';
import { rmDirRetrying } from './__fixtures__/rm-retry';

/**
 * `cli.ts`'s output-size and pagination guarantees, exercised against a small real store (not
 * mocked) so the bound is checked on the actual JSON `summary`/`series` produce.
 */
describe('analysis output bounds', () => {
    jest.setTimeout(60_000);
    let dir: string;
    let store: Store;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-cli-'));
        const result = await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 5,
            recording: { dir, intervalSimSeconds: 0.1 },
        });
        store = await ingest(path.join(dir, 'store.duckdb'), result.recording as string, {
            player: TRAINING_PLAYER_ID,
            target: TRAINING_TARGET_ID,
        });
        await computeEvents(store, result.recording as string);
        await computeChecks(store, result.recording as string);
    });

    afterAll(async () => {
        await store.close();
        await rmDirRetrying(dir);
    });

    it('summary is under 2 KB', async () => {
        const recordingRunId = (await store.all<{ run_id: string }>('SELECT run_id FROM run LIMIT 1'))[0].run_id;
        const runRow = (await store.all('SELECT * FROM run WHERE run_id = ?', recordingRunId))[0];
        const objects = await store.all('SELECT object_id, type, role FROM object WHERE run_id = ?', recordingRunId);
        const checks = await store.all(
            'SELECT name, status, t, detail_json FROM check_result WHERE run_id = ?',
            recordingRunId,
        );
        const eventCounts = await store.all(
            'SELECT kind, count(*) AS count FROM event WHERE run_id = ? GROUP BY kind ORDER BY kind',
            recordingRunId,
        );
        const summary = { run: runRow, objects, checks, eventCounts };
        const json = JSON.stringify(summary, (_k, v: unknown) => (typeof v === 'bigint' ? Number(v) : v));
        expect(json.length).toBeLessThan(2048);
    });

    it('series refuses to return more than 500 points', async () => {
        const recordingRunId = (await store.all<{ run_id: string }>('SELECT run_id FROM run LIMIT 1'))[0].run_id;
        const points = await store.series(recordingRunId, TRAINING_PLAYER_ID, '/position/x', 0, 5, 500);
        expect(points.length).toBeLessThanOrEqual(500);
    });
});
