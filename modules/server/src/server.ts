import * as http from 'http';

/* eslint-disable no-console */
/*
 * embed webpack-dev-server
 */
import { Server, matchMaker } from 'colyseus';

import { AdminRoom } from './admin/room';
import { GameManager } from './admin/game-manager';
import { MqttClient } from './messaging/mqtt-client';
import { ShipRoom } from './ship/room';
import { ShipStateMessenger } from './messaging/ship-state-messenger';
import { SpaceRoom } from './space/room';
import { monitor } from '@colyseus/monitor';

import express = require('express');
import basicAuth = require('express-basic-auth');

process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});

export async function server(port: number, staticDir: string, mqttUrl = 'http://localhost', mqttPort = 1883) {
    const app = express();
    app.use(express.json());
    const gameServer = new Server({ server: http.createServer(app) });

    gameServer.define('space', SpaceRoom);
    gameServer.define('admin', AdminRoom);
    gameServer.define('ship', ShipRoom).enableRealtimeListing();

    app.use('/', express.static(staticDir));

    // add colyseus monitor
    const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
    app.use('/colyseus', auth, monitor());

    await gameServer.listen(port);
    console.log(`Listening on port ${port}`);

    const shipMessenger = new ShipStateMessenger(new MqttClient(mqttUrl, mqttPort));
    const gameManager = new GameManager(shipMessenger);
    await matchMaker.createRoom('admin', { manager: gameManager }); // create a room
}
