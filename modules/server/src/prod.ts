/* eslint-disable no-console */
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { MqttClient } from './messaging/mqtt-client';
import { ShipStateMessenger } from './messaging/ship-state-messenger';
import { server } from './server';

const port = Number(process.env.PORT || 80);
const mqttHostame = String(process.env.MQTT || 'http://localhost');
const mqttPort = Number(process.env.MQTT_PORT || 1883);

process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});
const shipMessenger = new ShipStateMessenger(new MqttClient(mqttHostame, mqttPort));
const gameManager = new GameManager(shipMessenger);
// this path has to match the setup in scripts/post-build.js and scripts/pkg.js
void server(port, path.join(__dirname, '..', '..', '..', '..', 'static'), gameManager).then(({ addressInfo }) => {
    console.log(`Listening on port ${addressInfo.port}`);
});
