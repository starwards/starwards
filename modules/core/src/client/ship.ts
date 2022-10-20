import { GameRoom, sendJsonCmd } from '..';
import { readNumberProp, readProp, readWriteNumberProp, readWriteProp, writeProp } from '../api/properties';

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
        setPrimitiveState: sendJsonCmd.bind(null, shipRoom),
        writeProp: <T extends Primitive>(pointerStr: string) => writeProp<T>(shipRoom, pointerStr),
        readProp: <T>(pointerStr: string) => readProp<T>(shipRoom, events, pointerStr),
        readWriteProp: <T extends Primitive>(pointerStr: string) => readWriteProp<T>(shipRoom, events, pointerStr),
        readWriteNumberProp: readWriteNumberProp.bind(null, shipRoom, events),
        readNumberProp: readNumberProp.bind(null, shipRoom, events),
    };
}
