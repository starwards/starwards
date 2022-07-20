import * as _adminProperties from './admin-properties';

import { Schema, type } from '@colyseus/schema';

export class AdminState extends Schema {
    @type('boolean')
    isGameRunning = false;

    // server only, used for commands
    shouldGameBeRunning = false;
}

export const adminProperties = _adminProperties;
