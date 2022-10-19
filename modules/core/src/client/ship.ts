import { GameRoom, RoomName, isJsonPointer } from '..';
import { Primitive, isPrimitive } from 'colyseus-events';
import { RoomEventEmitter, makeEventsEmitter } from './events';
import { readNumberProp, readProp, readWriteNumberProp, readWriteProp, writeProp } from '../api/properties';

import { JsonStringPointer } from 'json-ptr';
import { waitForEvents } from '../async-utils';

export class NumberMapDriver<R extends RoomName, K extends string> {
    public mapApi = readWriteProp<Map<K, number>>(this.shipRoom, this.events, this.pointerStr);
    constructor(
        private shipRoom: GameRoom<R>,
        private events: RoomEventEmitter,
        private pointerStr: JsonStringPointer
    ) {}
    get map(): Map<K, number> {
        return this.mapApi.getValue();
    }
    get fields() {
        return this.map.keys();
    }
    onChange(cb: () => unknown) {
        return this.mapApi.onChange(cb);
    }
    getApi(name: K) {
        return readWriteProp<number>(this.shipRoom, this.events, this.pointerStr + '/' + name);
    }
}

export type ShipDriver = ReturnType<typeof newShipDriverObj>;

function newShipDriverObj(shipRoom: GameRoom<'ship'>, events: RoomEventEmitter) {
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
        readWriteNumberProp: readWriteNumberProp.bind(null, shipRoom, events),
        readNumberProp: readNumberProp.bind(null, shipRoom, events),
        constants: new NumberMapDriver(shipRoom, events, '/modelParams/params'),
        chainGunConstants: new NumberMapDriver(shipRoom, events, '/chainGun/modelParams/params'),
    };
}

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
    const driver = newShipDriverObj(shipRoom, events);
    return driver;
}
