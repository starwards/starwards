import { GameRoom, RoomName, getJsonPointer, getRangeFromPointer } from '..';
import { JsonPointer, JsonStringPointer } from 'json-ptr';

import { Destructor } from '../utils';
import { EventEmitter } from './events';
import { cmdSender } from '../api';

export type ReadEventsApi<T> = {
    pointer: JsonPointer;
    getValue: () => T;
    onChange: (cb: () => unknown) => Destructor;
};
export type BaseEventsApi<T> = {
    pointer: JsonPointer;
    getValue: () => T;
    setValue: (v: T) => unknown;
    onChange: (cb: () => unknown) => Destructor;
};
export type WriteApi<T> = {
    setValue: (v: T) => unknown;
};

export type BaseNumbericEventsApi = {
    pointer: JsonPointer;
    getValue: () => number;
    setValue: (v: number) => unknown;
    onChange: (cb: () => unknown) => Destructor;
    range: readonly [number, number];
};

export type ReadNumbericEventsApi = {
    pointer: JsonPointer;
    getValue: () => number;
    onChange: (cb: () => unknown) => Destructor;
    range: readonly [number, number];
};

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

export function pointerReadEventsApi<T>(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadEventsApi<T> {
    const pointer = getJsonPointer(pointerStr);
    if (!pointer) {
        throw new Error(`Illegal json path:${pointerStr}`);
    }
    const getValue = () => pointer.get(room.state) as T;
    return { pointer, getValue, onChange: makeOnChange(getValue, events, pointerStr) };
}

export function pointerBaseEventsApi<T>(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): BaseEventsApi<T> {
    const readApi = pointerReadEventsApi<T>(room, events, pointerStr);
    return {
        ...readApi,
        ...pointerWriteApi(room, pointerStr),
    };
}

export function pointerWriteApi<T>(room: GameRoom<RoomName>, pointerStr: string): WriteApi<T> {
    return { setValue: cmdSender<T, RoomName>(room, { cmdName: pointerStr }, undefined) };
}

export function pointerBaseNumericEventsApi(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): BaseNumbericEventsApi {
    const api = pointerBaseEventsApi<number>(room, events, pointerStr);
    return { ...api, range: getRangeFromPointer(room.state, api.pointer) };
}
export function pointerReadNumericEventsApi(
    room: GameRoom<RoomName>,
    events: EventEmitter,
    pointerStr: JsonStringPointer
): ReadNumbericEventsApi {
    const api = pointerReadEventsApi<number>(room, events, pointerStr);
    return { ...api, range: getRangeFromPointer(room.state, api.pointer) };
}
