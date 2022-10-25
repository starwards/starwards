import { GameRoom, RoomEventEmitter, getDefectibles, sendJsonCmd } from '..';
import { Primitive, wireEvents } from 'colyseus-events';

import EventEmitter2 from 'eventemitter2';
import { waitForEvents } from '../async-utils';

export type ShipDriver = Awaited<ReturnType<typeof ShipDriver>>;

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    // wire commulative events
    events.on('/armor/armorPlates/*/health', (e) => {
        events.emit(`/armor/numberOfHealthyPlates`, e);
    });
    wireEvents(shipRoom.state, events);
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
    const defectibles = getDefectibles(shipRoom.state);
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        defectibles,
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(shipRoom, pointerStr, value),
    };
}
