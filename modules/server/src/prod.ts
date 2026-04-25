import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { createLogger } from '@starwards/core/internal';
import { server } from './server';

const { debug: logDebug, error: logError } = createLogger('server:prod');

const port = Number(process.env.PORT || 80);

process.on('uncaughtException', function (err) {
    logError(new Date().toUTCString() + ' uncaughtException:', err.message);
    logError(err.stack);
    // process.exit(1);
});
const gameManager = new GameManager();
// this path has to match the setup in scripts/post-build.js and scripts/pkg.js
void server(port, path.join(__dirname, '..', '..', '..', '..', 'static'), gameManager).then(({ addressInfo }) => {
    logDebug(`Listening on port ${addressInfo.port}`);
});
