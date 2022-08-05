import { GameRoom, RoomName, getJsonPointer, getRangeFromPointer } from '..';
import { JsonPointer, JsonStringPointer } from 'json-ptr';

import { Destructor } from '../utils';
import { EventEmitter } from '../client/events';
import { cmdSender } from '.';

export type ReadProp<T> = {
    pointer: JsonPointer;
    getValue: () => T;
    onChange: (cb: () => unknown) => Destructor;
};
export type WriteProp<T> = {
    setValue: (v: T) => unknown;
};
export type ReadWriteProp<T> = ReadProp<T> & WriteProp<T>;
export type ReadNumberProp = ReadProp<number> & { range: readonly [number, number] };
export type ReadWriteNumberProp = ReadProp<number> & WriteProp<number> & { range: readonly [number, number] };

export function makeOnChange(getValue: () => unknown, events: EventEmitter, eventName: string) {
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

export function readProp<T>(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadProp<T> {
    const pointer = getJsonPointer(pointerStr);
    if (!pointer) {
        throw new Error(`Illegal json path:${pointerStr}`);
    }
    const getValue = () => pointer.get(room.state) as T;
    return { pointer, getValue, onChange: makeOnChange(getValue, events, pointerStr) };
}

export function readWriteProp<T>(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadWriteProp<T> {
    return {
        ...readProp<T>(room, events, pointerStr),
        ...writeProp(room, pointerStr),
    };
}

export function writeProp<T>(room: GameRoom<RoomName>, pointerStr: string): WriteProp<T> {
    return { setValue: cmdSender<T, RoomName>(room, { cmdName: pointerStr }, undefined) };
}

export function readWriteNumberProp(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadWriteNumberProp {
    const api = readWriteProp<number>(room, events, pointerStr);
    return { ...api, range: getRangeFromPointer(room.state, api.pointer) };
}
export function readNumberProp(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadNumberProp {
    const api = readProp<number>(room, events, pointerStr);
    return { ...api, range: getRangeFromPointer(room.state, api.pointer) };
}
