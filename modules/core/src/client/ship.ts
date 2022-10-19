import { GameRoom, RoomName, isJsonPointer } from '..';
import { Primitive, isPrimitive } from 'colyseus-events';
import { RoomEventEmitter, makeEventsEmitter } from './events';
import {
    makeOnChange,
    readNumberProp,
    readProp,
    readWriteNumberProp,
    readWriteProp,
    writeProp,
} from '../api/properties';

import { JsonStringPointer } from 'json-ptr';
import { waitForEvents } from '../async-utils';

export type ThrusterDriver = ReturnType<ThrustersDriver['makeDriver']>;
export class ThrustersDriver {
    private cache = new Map<number, ThrusterDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: RoomEventEmitter) {}

    getApi(index: number): ThrusterDriver {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue = this.makeDriver(index);
            this.cache.set(index, newValue);
            return newValue;
        }
    }

    private makeDriver(index: number) {
        return {
            index,
            broken: { getValue: () => this.shipRoom.state.thrusters[index].broken },
            angle: readWriteProp<number>(this.shipRoom, this.events, `/thrusters/${index}/angle`),
            angleError: readWriteNumberProp(this.shipRoom, this.events, `/thrusters/${index}/angleError`),
            availableCapacity: readWriteNumberProp(this.shipRoom, this.events, `/thrusters/${index}/availableCapacity`),
        };
    }

    public *[Symbol.iterator](): IterableIterator<ThrusterDriver> {
        for (let i = 0; i < this.shipRoom.state.thrusters.length; i++) {
            yield this.getApi(i);
        }
    }
}

export type PlateDriver = ReturnType<ArmorDriver['makePlateDriver']>;
export class ArmorDriver {
    public numPlates = readProp<number>(this.shipRoom, this.events, '/armor/numberOfPlates');
    private countHealthyPlayes = () => {
        let count = 0;
        for (const plate of this.shipRoom.state.armor.armorPlates) if (plate.health > 0) count++;
        return count;
    };
    public numHealthyPlates = {
        getValue: this.countHealthyPlayes,
        onChange: makeOnChange(this.countHealthyPlayes, this.events, '/armor/armorPlates/*/health'),
    };
    private cache = new Map<number, PlateDriver>();
    constructor(private shipRoom: GameRoom<'ship'>, private events: RoomEventEmitter) {}

    private makePlateDriver(index: number) {
        return {
            index,
            health: readWriteNumberProp(this.shipRoom, this.events, `/armor/armorPlates/${index}/health`),
            maxHealth: readWriteNumberProp(this.shipRoom, this.events, `/armor/armorPlates/${index}/maxHealth`),
        };
    }
    getApi(index: number): PlateDriver {
        const result = this.cache.get(index);
        if (result) {
            return result;
        } else {
            const newValue: PlateDriver = this.makePlateDriver(index);
            this.cache.set(index, newValue);
            return newValue;
        }
    }
    public *[Symbol.iterator](): IterableIterator<PlateDriver> {
        for (let i = 0; i < this.numPlates.getValue(); i++) {
            yield this.getApi(i);
        }
    }
}

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
        readWriteNumberProp: readWriteNumberProp.bind(null, shipRoom, events),
        readNumberProp: readNumberProp.bind(null, shipRoom, events),
        armor: new ArmorDriver(shipRoom, events),
        thrusters: new ThrustersDriver(shipRoom, events),
        constants: new NumberMapDriver(shipRoom, events, '/modelParams/params'),
        chainGunConstants: new NumberMapDriver(shipRoom, events, '/chainGun/modelParams/params'),
        rotationCommand: readWriteNumberProp(shipRoom, events, `/smartPilot/rotation`),
        shellSecondsToLive: readNumberProp(shipRoom, events, '/chainGun/shellSecondsToLive'),
        shellRange: readWriteNumberProp(shipRoom, events, `/chainGun/shellRange`),
        rotation: readNumberProp(shipRoom, events, `/rotation`),
        strafeCommand: readWriteNumberProp(shipRoom, events, `/smartPilot/maneuvering/y`),
        boostCommand: readWriteNumberProp(shipRoom, events, `/smartPilot/maneuvering/x`),
        strafe: readNumberProp(shipRoom, events, `/strafe`),
        boost: readNumberProp(shipRoom, events, `/boost`),
        energy: readNumberProp(shipRoom, events, `/reactor/energy`),
        afterBurnerFuel: readNumberProp(shipRoom, events, `/reactor/afterBurnerFuel`),
    };
}

export async function ShipDriver(shipRoom: GameRoom<'ship'>) {
    const events = makeEventsEmitter(shipRoom.state);
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
