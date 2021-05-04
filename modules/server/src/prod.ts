import * as path from 'path';

import { server } from './server';

const port = Number(process.env.PORT || 80);
const mqttHostame = String(process.env.MQTT || 'http://localhost');
const mqttPort = Number(process.env.MQTT_PORT || 1883);
// this path has to match the setup in scripts/pkg.js
void server(port, path.join(__dirname, '..', 'static'), mqttHostame, mqttPort);

// for local debugging run server(80, path.join(__dirname, '..', '..', 'browser', 'dist'));
