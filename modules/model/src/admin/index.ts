import * as _adminProperties from './admin-properties';

import { Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    @type('float32')
    speed = 1;
}

export const adminProperties = _adminProperties;
