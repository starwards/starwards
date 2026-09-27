import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Store, ingest } from './store';

import { HeadlessGame } from '../../headless-game';
import { HeadlessRecorder } from '../../headless-recorder';
import { rmDirRetrying } from './__fixtures__/rm-retry';
import { training_t0 } from '../../../scenarios/training';

jest.setTimeout(30_000);

describe('Store', () => {
    // One store for the whole suite (closing DuckDB does not release the Windows file handle
    // immediately, which makes per-test open/close slow and flaky). Each test gets its own
    // `run_id`, since every query here is scoped by it.
    let dir: string;
    let store: Store;
    let runId: string;
    let nextRunId = 0;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-store-'));
        store = Store.open(path.join(dir, 'test.duckdb'));
        await store.createSchema();
    });

    beforeEach(() => {
        runId = `run-${nextRunId++}`;
    });

    afterAll(async () => {
        await store.close();
        await rmDirRetrying(dir);
    });

    async function insertValue(objectId: string, p: string, t: number, num: number) {
        await store.run('INSERT INTO value VALUES (?, ?, ?, ?, ?, ?, ?)', runId, objectId, p, t, num, null, null);
    }

    it('valueAt returns the last-written value across a gap', async () => {
        await insertValue('a', '/x', 0, 10);
        await insertValue('a', '/x', 5, 20);
        // no row at t=6..9: value should hold at 20 (delta encoding semantics)
        const v = await store.valueAt(runId, 'a', '/x', 8);
        expect(v?.num).toBe(20);

        const before = await store.valueAt(runId, 'a', '/x', 2);
        expect(before?.num).toBe(10);

        const missing = await store.valueAt(runId, 'a', '/x', -1);
        expect(missing).toBeUndefined();
    });

    it('series downsamples to at most maxPoints while seriesStats keeps full-resolution extremes', async () => {
        // 1000 rows, a single sharp spike at t=500 that a coarse downsample could skip.
        for (let t = 0; t < 1000; t++) {
            await insertValue('a', '/speed', t, t === 500 ? 999 : 1);
        }
        const points = await store.series(runId, 'a', '/speed', 0, 999, 50);
        expect(points.length).toBeLessThanOrEqual(50);

        const stats = await store.seriesStats(runId, 'a', '/speed', 0, 999);
        expect(stats.max).toBe(999);
        expect(stats.argmax).toBe(500);
        expect(stats.min).toBe(1);
    });

    it('ingest stores the recording header hz on the run row', async () => {
        const game = HeadlessGame.start(training_t0, 1);
        const recorder = new HeadlessRecorder(game, dir, 'hz', 0.1, undefined, 60);
        await recorder.capture();
        game.tick(0.1);
        await recorder.capture(true);
        const ingested = await ingest(path.join(dir, 'hz.duckdb'), recorder.filePath);
        const rows = await ingested.all<{ hz: number | null }>('SELECT hz FROM run');
        await ingested.close();
        expect(rows).toEqual([{ hz: 60 }]);
    });
});
