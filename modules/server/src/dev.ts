import * as path from 'path';

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

void server(port, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
