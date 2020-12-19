import * as _adminProperties from './admin-properties';

import { MapSchema, Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    @type({ map: 'uint8' })
    points!: MapSchema<number>;

    // server only, used for commands
    shouldGameBeRunning = false;
}

export const adminProperties = _adminProperties;
