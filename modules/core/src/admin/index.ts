import * as _adminProperties from './admin-properties';

import { ArraySchema, Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    @type(['string'])
    shipIds = new ArraySchema<string>();

    @type('float32')
    speed = 1;
}

export const adminProperties = _adminProperties;
