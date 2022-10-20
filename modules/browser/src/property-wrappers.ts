import { Destructor, RoomEventEmitter, getJsonPointer, getRange } from '@starwards/core';

import { JsonStringPointer } from 'json-ptr';
import { Primitive } from 'colyseus-events';
import { Schema } from '@colyseus/schema';

interface Driver {
    readonly state: Schema;
    events: RoomEventEmitter;
    sendJsonCmd(pointerStr: string, value: Primitive): void;
}

function makeOnChange(getValue: () => unknown, events: RoomEventEmitter, eventName: string) {
    return (cb: () => unknown): Destructor => {
        let lastValue = getValue();
        const listener = () => {
            const newValue = getValue();
            if (newValue !== lastValue) {
                lastValue = newValue;
                cb();
            }
        };
        events.on(eventName, listener);
        return () => events.off(eventName, listener);
    };
}

export function readProp<T>(driver: Driver, pointerStr: JsonStringPointer) {
    const pointer = getJsonPointer(pointerStr);
    if (!pointer) {
        throw new Error(`Illegal json path:${pointerStr}`);
    }
    const getValue = () => pointer.get(driver.state) as T;
    return { pointer, getValue, onChange: makeOnChange(getValue, driver.events, pointerStr) };
}

export function readWriteProp<T extends Primitive>(driver: Driver, pointerStr: JsonStringPointer) {
    return {
        ...readProp<T>(driver, pointerStr),
        ...writeProp(driver, pointerStr),
    };
}

export function writeProp<T extends Primitive>(driver: Driver, pointerStr: string) {
    return { setValue: (value: T) => driver.sendJsonCmd(pointerStr, value) };
}

export function readWriteNumberProp(driver: Driver, pointerStr: JsonStringPointer) {
    const api = readWriteProp<number>(driver, pointerStr);
    return { ...api, range: getRange(driver.state, api.pointer) };
}
export function readNumberProp(driver: Driver, pointerStr: JsonStringPointer) {
    const api = readProp<number>(driver, pointerStr);
    return { ...api, range: getRange(driver.state, api.pointer) };
}
