/* eslint-disable no-console */
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { MqttClient } from './messaging/mqtt-client';
import { ShipStateMessenger } from './messaging/ship-state-messenger';
import { server } from './server';

const port = Number(process.env.PORT || 8080);
const mqttHostame = String(process.env.MQTT || 'http://localhost');
const mqttPort = Number(process.env.MQTT_PORT || 1883);

process.on('uncaughtException', function (err) {
    console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    // process.exit(1);
});

const shipMessenger = new ShipStateMessenger(new MqttClient(mqttHostame, mqttPort));
const gameManager = new GameManager(shipMessenger);

void server(port, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
