import { ShipState, Spaceship } from '@starwards/core';

import EventEmitter2 from 'eventemitter2';

export interface MockShipDriver {
    events: EventEmitter2;
    id: string;
    state: ShipState;
    systems: unknown[];
}

export function createMockShipDriver(ship: Spaceship): MockShipDriver {
    return {
        events: new EventEmitter2({ wildcard: true, delimiter: '/', maxListeners: 0 }),
        id: ship.id,
        state: ship as unknown as ShipState,
        systems: [],
    };
}
