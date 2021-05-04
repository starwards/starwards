import * as path from 'path';

import { server } from './server';

void server(
    Number(process.env.PORT || 8080),
    path.resolve(__dirname, '..', '..', '..', 'static'),
    String(process.env.MQTT || 'http://localhost'),
    Number(process.env.MQTT_PORT || 1883)
);
