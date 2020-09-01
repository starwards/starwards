// tslint:disable no-console
/*
 * embed webpack-dev-server
 */

import { Server, matchMaker } from 'colyseus';
import * as http from 'http';
import express = require('express');
import basicAuth = require('express-basic-auth');
import { monitor } from '@colyseus/monitor';
import { SpaceRoom } from './space/room';
import { NextHandleFunction } from 'connect';
import { AdminRoom } from './admin/room';
import { ShipRoom } from './ship/room';
import { GameManager } from './admin/game-manager';

process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});

export async function server(port: number, staticDir: string, handlers?: NextHandleFunction[]) {
    const app = express();
    app.use(express.json());
    const gameServer = new Server({ server: http.createServer(app) });

    gameServer.define('space', SpaceRoom);
    gameServer.define('admin', AdminRoom);
    gameServer.define('ship', ShipRoom).enableRealtimeListing();

    if (handlers) {
        app.use(...handlers);
    }

    app.use('/', express.static(staticDir));

    // add colyseus monitor
    const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
    app.use('/colyseus', auth, monitor());

    await gameServer.listen(port);
    // tslint:disable-next-line:no-console
    console.log(`Listening on port ${port}`);

    const gameManager = new GameManager();
    await matchMaker.createRoom('admin', { manager: gameManager }); // create a room
}
