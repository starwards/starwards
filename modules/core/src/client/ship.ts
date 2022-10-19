import { GameRoom, isJsonPointer } from '..';
import { Primitive, isPrimitive } from 'colyseus-events';
import { readNumberProp, readProp, readWriteNumberProp, readWriteProp, writeProp } from '../api/properties';

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
        setPrimitiveState: (pointerStr: string, value: Primitive) => {
            if (!isJsonPointer(pointerStr)) {
                throw new Error(`not a legal Json pointer: ${JSON.stringify(pointerStr)}`);
            }
            if (!isPrimitive(value)) {
                throw new Error(`not a legal value: ${JSON.stringify(value)}`);
            }
            shipRoom.send(pointerStr, { value });
        },
        writeProp: <T>(pointerStr: string) => writeProp<T>(shipRoom, pointerStr),
        readProp: <T>(pointerStr: string) => readProp<T>(shipRoom, events, pointerStr),
        readWriteProp: <T>(pointerStr: string) => readWriteProp<T>(shipRoom, events, pointerStr),
        readWriteNumberProp: readWriteNumberProp.bind(null, shipRoom, events),
        readNumberProp: readNumberProp.bind(null, shipRoom, events),
    };
}
