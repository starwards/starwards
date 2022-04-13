/* eslint-disable no-console */
import * as http from 'http';

import { Server, matchMaker } from 'colyseus';

import { AdminRoom } from './admin/room';
import { GameManager } from './admin/game-manager';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import basicAuth from 'express-basic-auth';
import express from 'express';
import { monitor } from '@colyseus/monitor';

export async function server(port: number, staticDir: string, manager: GameManager) {
    const app = express();
    app.use(express.json() as express.RequestHandler);
    const gameServer = new Server({ transport: new WebSocketTransport({ server: http.createServer(app) }) });

    gameServer.define('space', SpaceRoom);
    gameServer.define('admin', AdminRoom);
    gameServer.define('ship', ShipRoom).enableRealtimeListing();

    app.use('/', express.static(staticDir));

    // add colyseus monitor
    const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
    app.use('/colyseus', auth, monitor());

    await gameServer.listen(port);
    console.log(`Listening on port ${port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
}
