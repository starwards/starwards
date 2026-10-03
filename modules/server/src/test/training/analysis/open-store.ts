import * as fs from 'node:fs';

import { Store, ingest, storePathFor } from './store';

import { EVENTS_EXT } from '@starwards/core/internal';
import { RECORDING_EXT } from '../../../recording/game-recorder';
import { computeChecks } from './checks';
import { computeEvents } from './events';

/** Roles to tag on ingest, as `ingest` takes them. */
export interface RecordingRoles {
    readonly player?: string;
    readonly target?: string;
}

/**
 * The analysis store for `recordingPath`, at `dbPath` (default {@link storePathFor}). Re-ingests --
 * then recomputes events and checks -- when the store is missing or older than the recording or its
 * `.events.jsonl` sidecar, since `computeEvents` reads the sidecar and a re-run may rewrite only it.
 * `roles` apply only when it ingests. The store's run id is `recordingPath`. Caller closes the store.
 */
export async function openRecordingStore(
    recordingPath: string,
    roles: RecordingRoles = {},
    dbPath = storePathFor(recordingPath),
): Promise<Store> {
    if (isStoreStale(dbPath, recordingPath)) {
        const store = await ingest(dbPath, recordingPath, roles);
        await computeEvents(store, recordingPath);
        await computeChecks(store, recordingPath);
        return store;
    }
    return Store.open(dbPath);
}

/** Whether the store at `dbPath` is missing or older than `recordingPath` or its `.events.jsonl` sidecar. */
export function isStoreStale(dbPath: string, recordingPath: string): boolean {
    if (!fs.existsSync(dbPath)) {
        return true;
    }
    const storeTime = fs.statSync(dbPath).mtimeMs;
    const sidecar = recordingPath.endsWith(RECORDING_EXT)
        ? recordingPath.slice(0, -RECORDING_EXT.length) + EVENTS_EXT
        : null;
    const sources = [recordingPath, ...(sidecar && fs.existsSync(sidecar) ? [sidecar] : [])];
    return sources.some((source) => storeTime < fs.statSync(source).mtimeMs);
}
