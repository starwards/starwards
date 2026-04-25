import EventEmitter2 from 'eventemitter2';
import { ShipState } from '@starwards/core';

export interface MockShipDriver {
    events: EventEmitter2;
    id: string;
    state: ShipState;
    systems: unknown[];
}

export function createMockShipDriver(ship: ShipState): MockShipDriver {
    return {
        events: new EventEmitter2({ wildcard: true, delimiter: '/', maxListeners: 0 }),
        id: ship.id,
        state: ship,
        systems: [],
    };
}
