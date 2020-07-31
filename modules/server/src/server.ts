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

    gameServer
        .define('space', SpaceRoom)
        .on('create', (room) => console.log('SpaceRoom created:', room.roomId))
        .on('dispose', (room) => console.log('SpaceRoom disposed:', room.roomId))
        .on('join', (room, client) => console.log('SpaceRoom:', client.sessionId, 'joined', room.roomId))
        .on('leave', (room, client) => console.log('SpaceRoom:', client.sessionId, 'left', room.roomId));

    gameServer
        .define('admin', AdminRoom)
        .on('create', (room) => console.log('AdminRoom created:', room.roomId))
        .on('dispose', (room) => console.log('AdminRoom disposed:', room.roomId))
        .on('join', (room, client) => console.log('AdminRoom:', client.sessionId, 'joined', room.roomId))
        .on('leave', (room, client) => console.log('AdminRoom:', client.sessionId, 'left', room.roomId));

    gameServer
        .define('ship', ShipRoom)
        .on('create', (room) => console.log('ship created:', room.roomId))
        .on('dispose', (room) => console.log('ship disposed:', room.roomId))
        .on('join', (room, client) => console.log('ship:', client.sessionId, 'joined', room.roomId))
        .on('leave', (room, client) => console.log('ship:', client.sessionId, 'left', room.roomId))
        .enableRealtimeListing();

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
