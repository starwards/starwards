import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../../scenarios/training';
import { isStoreStale, openRecordingStore } from './open-store';
import { runTraining, trainingScenarios } from '../training-scenarios';

import { EVENTS_EXT } from '@starwards/core/internal';
import { RECORDING_EXT } from '../../../recording/game-recorder';
import { rmDirRetrying } from './__fixtures__/rm-retry';

describe('openRecordingStore', () => {
    jest.setTimeout(60_000);
    let dir: string;
    let recording: string;
    /** Not the default store path: `runTraining` already ingested there, and DuckDB's Windows handle
     * can lag its close, so deleting that file races an `EPERM`. */
    let dbPath: string;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-open-store-'));
        const result = await runTraining(trainingScenarios.T0, {
            seed: 1,
            timeoutSeconds: 3,
            recording: { dir, intervalSimSeconds: 1 },
        });
        recording = result.recording as string;
        dbPath = path.join(dir, 'opened.duckdb');
    });

    afterAll(async () => {
        await rmDirRetrying(dir);
    });

    /** Bumps `file`'s mtime past the store's, as a re-run that rewrote it would. */
    function touchAfterStore(file: string, store: string) {
        const future = new Date(fs.statSync(store).mtimeMs + 10_000);
        fs.utimesSync(file, future, future);
    }

    it('ingests a missing store with events, checks and roles', async () => {
        const store = await openRecordingStore(
            recording,
            { player: TRAINING_PLAYER_ID, target: TRAINING_TARGET_ID },
            dbPath,
        );
        try {
            const roles = await store.all<{ role: string }>(
                'SELECT role FROM object WHERE run_id = ? AND object_id = ?',
                recording,
                TRAINING_PLAYER_ID,
            );
            const checks = await store.all('SELECT name FROM check_result WHERE run_id = ?', recording);
            expect(roles[0]?.role).toBe('player');
            expect(checks.length).toBeGreaterThan(0);
        } finally {
            await store.close();
        }
    });

    it('is stale when the store is missing, or older than the recording or its events sidecar', () => {
        const sidecar = recording.slice(0, -RECORDING_EXT.length) + EVENTS_EXT;
        const freshPath = path.join(dir, 'stale-probe.duckdb');
        expect(isStoreStale(freshPath, recording)).toBe(true);

        fs.writeFileSync(freshPath, '');
        const old = new Date(fs.statSync(freshPath).mtimeMs - 10_000);
        fs.utimesSync(recording, old, old);
        fs.utimesSync(sidecar, old, old);
        expect(isStoreStale(freshPath, recording)).toBe(false);

        touchAfterStore(sidecar, freshPath);
        expect(isStoreStale(freshPath, recording)).toBe(true);

        fs.utimesSync(sidecar, old, old);
        touchAfterStore(recording, freshPath);
        expect(isStoreStale(freshPath, recording)).toBe(true);
    });
});
