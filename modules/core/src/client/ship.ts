import { GameRoom, sendJsonCmd } from '..';

import { Primitive } from 'colyseus-events';
import { makeEventsEmitter } from './events';
import { waitForEvents } from '../async-utils';

export type ShipDriver = Awaited<ReturnType<typeof ShipDriver>>;

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const events = makeEventsEmitter(shipRoom.state);
    // wire commulative events
    events.on('/armor/armorPlates/*/health', (e) => {
        events.emit(`/armor/numberOfHealthyPlates`, e);
    });
    const pendingEvents = [];
    if (!shipRoom.state.chainGun) {
        pendingEvents.push('/chainGun');
    }
    if (!shipRoom.state.modelParams) {
        pendingEvents.push('/modelParams');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('/thrusters');
    }
    if (!shipRoom.state.armor) {
        pendingEvents.push('/armor');
    }
    await waitForEvents(events, pendingEvents);
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(shipRoom, pointerStr, value),
    };
}
