const DB_NAME = 'starwards-recording-handoff';
const STORE = 'recordings';
const KEY = 'pending';

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = act(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
        });
    } finally {
        db.close();
    }
}

type PendingRecording = { name: string; text: string };

/**
 * Passes a recording a user dropped on one page (the lobby) to the next (the player): a `File`
 * cannot travel through a navigation, and a long recording is too big for session storage.
 */
export function stashRecording(recording: PendingRecording) {
    return run('readwrite', (store) => store.put(recording, KEY));
}

/** The stashed recording, removed so a reload does not replay a stale one. */
export async function takeRecording(): Promise<PendingRecording | undefined> {
    const recording = await run<PendingRecording | undefined>(
        'readonly',
        (store) => store.get(KEY) as IDBRequest<PendingRecording | undefined>,
    );
    await run('readwrite', (store) => store.delete(KEY));
    return recording;
}
