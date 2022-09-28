/* eslint-disable no-console */
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { server } from './server';

const port = Number(process.env.PORT || 80);

process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});
const gameManager = new GameManager();
// this path has to match the setup in scripts/post-build.js and scripts/pkg.js
void server(port, path.join(__dirname, '..', '..', '..', '..', 'static'), gameManager).then(({ addressInfo }) => {
    console.log(`Listening on port ${addressInfo.port}`);
});
