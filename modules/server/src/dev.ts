/* eslint-disable no-console */
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { server } from './server';

const port = Number(process.env.PORT || 8080);
process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});

const gameManager = new GameManager();

void server(port, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
