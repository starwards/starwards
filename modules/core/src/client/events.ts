import { Add, Event, Remove, Replace, wireEvents } from 'colyseus-events';

import { EventEmitter2 } from 'eventemitter2';
import { Schema } from '@colyseus/schema';
import { SpaceState } from '../space';

type EventMap = Record<string, unknown>;

type EventKey<T extends EventMap> = string & keyof T;
type EventReceiver<T> = (params: T) => unknown;

export interface EventEmitter<T extends EventMap> {
    on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    once<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): unknown;
    emit<K extends EventKey<T>>(eventName: K, params: T[K]): unknown;
}

export type RoomEventEmitter = EventEmitter<{ [k in string]: Event }>;
export type SpaceEventEmitter = RoomEventEmitter &
    EventEmitter<{
        $add: Add;
        $replace: Replace;
        $remove: Remove;
    }>;

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};
export function makeEventsEmitter(state: Schema): RoomEventEmitter {
    const events = new EventEmitter2(emitter2Options);
    wireEvents(state, events);
    return events;
}

export function makeSpaceEventsEmitter(state: SpaceState): SpaceEventEmitter {
    const events = new EventEmitter2(emitter2Options);
    // wire objects lifecycle events
    events.on('/*', (e: Event) => {
        events.emit(`$${e.op}`, e);
    });
    events.on('/*/*/destroyed', (e: Event) => {
        if (e.op === 'replace' && e.value) {
            events.emit(`$remove`, Remove(e.path.slice(0, e.path.lastIndexOf('/'))));
        }
    });
    wireEvents(state, events);
    return events;
}
