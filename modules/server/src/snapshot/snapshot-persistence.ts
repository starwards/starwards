import * as fs from 'node:fs/promises';
import * as maps from '../maps';
import * as path from 'node:path';

import { schemaToString, stringToSchema } from '../serialization/game-state-serialization';

import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { createLogger } from '@starwards/core/internal';

const { info: logInfo, error: logError } = createLogger('server:snapshot');

const mapsMap = new Map(Object.values(maps).map((m) => [m.name, m]));

const DEFAULT_SNAPSHOT_INTERVAL_MS = 5_000;
// modules/server/.state-snapshot/ (gitignored) — works from both src/ (ts-node) and cjs/ (compiled)
const DEFAULT_SNAPSHOT_FILE = path.resolve(__dirname, '..', '..', '.state-snapshot', 'game-snapshot.b64');

type Env = Record<string, string | undefined>;

export function isSnapshotRestoreEnabled(env: Env = process.env): boolean {
    return env.STARWARDS_RESTORE === '1' || env.STARWARDS_RESTORE === 'true';
}

export function snapshotFilePath(env: Env = process.env): string {
    return env.STARWARDS_SNAPSHOT_FILE || DEFAULT_SNAPSHOT_FILE;
}

/**
 * Persist the currently running game to a file (atomically, via temp file + rename).
 * @returns true if a snapshot was written, false if no game is running.
 */
export async function writeGameSnapshot(manager: GameManager, filePath: string): Promise<boolean> {
    const savedGame = manager.saveGame();
    if (!savedGame) {
        return false;
    }
    const serialized = await schemaToString(savedGame);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpFile = `${filePath}.tmp`;
    await fs.writeFile(tmpFile, serialized, 'utf-8');
    await fs.rename(tmpFile, filePath);
    return true;
}

/**
 * Load a game snapshot from a file and start it on the given manager.
 * Never throws: a missing, corrupt, or unknown-map snapshot logs and returns false,
 * leaving the server to start empty as usual.
 * @returns true if a game was restored.
 */
export async function restoreGameSnapshot(manager: GameManager, filePath: string): Promise<boolean> {
    let serialized: string;
    try {
        serialized = await fs.readFile(filePath, 'utf-8');
    } catch {
        return false; // no snapshot file — nothing to restore
    }
    try {
        const savedGame = await stringToSchema(SavedGame, serialized);
        const map = mapsMap.get(savedGame.mapName);
        if (!map) {
            logError(`can't restore snapshot: unknown map "${savedGame.mapName}"`);
            return false;
        }
        await manager.loadGame(savedGame, map);
        logInfo(`restored game snapshot from ${filePath} (map "${map.name}")`);
        return true;
    } catch (e) {
        logError(`can't restore snapshot from ${filePath}:`, e);
        return false;
    }
}

/**
 * Periodically persist the running game state to a file.
 * Writes are skipped while no game is running and never overlap.
 * @returns an async function that stops the persistence loop and awaits any in-flight write.
 */
export function startSnapshotPersistence(
    manager: GameManager,
    filePath: string,
    intervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS,
): () => Promise<void> {
    let inFlight: Promise<unknown> | null = null;
    const timer = setInterval(() => {
        if (inFlight) {
            return;
        }
        inFlight = writeGameSnapshot(manager, filePath)
            .catch((e: unknown) => logError(`can't write snapshot to ${filePath}:`, e))
            .finally(() => {
                inFlight = null;
            });
    }, intervalMs);
    timer.unref();
    return async () => {
        clearInterval(timer);
        await inFlight;
    };
}
