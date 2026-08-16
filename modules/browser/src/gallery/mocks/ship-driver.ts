import EventEmitter2 from 'eventemitter2';
import { ShipState } from '@starwards/core';

interface MockShipDriver {
    events: EventEmitter2;
    id: string;
    state: ShipState;
    systems: unknown[];
    sendJsonCmd: (pointerStr: string, value: unknown) => void;
    sendGmJsonCmd: (pointerStr: string, value: unknown) => void;
}

export function createMockShipDriver(ship: ShipState): MockShipDriver {
    return {
        events: new EventEmitter2({ wildcard: true, delimiter: '/', maxListeners: 0 }),
        id: ship.id,
        state: ship,
        systems: [],
        // the gallery has no server behind it — writable widgets render, their commands go nowhere
        sendJsonCmd: () => undefined,
        sendGmJsonCmd: () => undefined,
    };
}
