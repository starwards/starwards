import { RoomEventEmitter, getSystems, sendJsonCmd } from '..';
import { ShipState } from '../ship';
import { Primitive, wireEvents } from 'colyseus-events';

import { Room } from 'colyseus.js';
import EventEmitter2 from 'eventemitter2';
import { waitForEvents } from '../async-utils';

export type ShipDriver = Awaited<ReturnType<typeof ShipDriver>>;

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};

export async function ShipDriver(shipRoom: Room<ShipState>) {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    // wire commulative events
    events.on('/armor/armorPlates/*/health', (e) => {
        events.emit(`/armor/numberOfHealthyPlates`, e);
    });
    // Wait for first state sync before wiring events to ensure refIds are initialized
    await new Promise<void>((resolve) => {
        shipRoom.onStateChange.once(() => {
            wireEvents(shipRoom, events);
            resolve();
        });
    });
    const pendingEvents = [];
    if (!shipRoom.state.chainGun) {
        pendingEvents.push('/chainGun');
    }
    if (!shipRoom.state.design) {
        pendingEvents.push('/design');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('/thrusters');
    }
    if (!shipRoom.state.armor) {
        pendingEvents.push('/armor');
    }
    await waitForEvents(events, pendingEvents);
    const systems = getSystems(shipRoom.state);
    for (const system of systems) {
        for (const defectible of system.defectibles) {
            events.on(`${system.pointer}/${defectible.field}`, (e) => {
                events.emit(`${system.pointer}/broken`, e);
            });
        }
    }
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        systems,
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(shipRoom, pointerStr, value),
    };
}
