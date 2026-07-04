import * as path from 'path';

import {
    isSnapshotRestoreEnabled,
    restoreGameSnapshot,
    snapshotFilePath,
    startSnapshotPersistence,
} from './snapshot/snapshot-persistence';

import { GameManager } from './admin/game-manager';
import { createLogger } from '@starwards/core/internal';
import { server } from './server';

const { error: logError } = createLogger('server:dev');

const port = Number(process.env.PORT || 8080);
process.on('uncaughtException', function (err) {
    logError(new Date().toUTCString() + ' uncaughtException:', err.message);
    logError(err.stack);
    // process.exit(1);
});

const gameManager = new GameManager();

void server(port, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager).then(async () => {
    // dev-only: opt-in game snapshot + auto-restore, so a dev-server restart
    // lands back in the same scenario (prerequisite for server hot-reload)
    if (isSnapshotRestoreEnabled()) {
        const snapshotFile = snapshotFilePath();
        await restoreGameSnapshot(gameManager, snapshotFile);
        startSnapshotPersistence(gameManager, snapshotFile);
    }
}, logError);
