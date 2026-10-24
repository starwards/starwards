import * as fs from 'node:fs';

import { Store, ingest, storePathFor } from './store';
import { computeChecks } from './checks';
import { computeEvents } from './events';
import { findSidecar } from '../../../recording/sidecar-file';
import { isRecordingName } from '@starwards/core/internal';

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

/** Whether the store at `dbPath` is missing or older than `recordingPath` or its sidecar (plain or `.zst`). */
export function isStoreStale(dbPath: string, recordingPath: string): boolean {
    if (!fs.existsSync(dbPath)) {
        return true;
    }
    const storeTime = fs.statSync(dbPath).mtimeMs;
    const sidecar = isRecordingName(recordingPath) ? findSidecar(recordingPath) : null;
    const sources = [recordingPath, ...(sidecar ? [sidecar] : [])];
    return sources.some((source) => storeTime < fs.statSync(source).mtimeMs);
}
