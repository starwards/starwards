import { Add, Event, Remove, Replace, wireEvents } from 'colyseus-events';

import { EventEmitter2 } from 'eventemitter2';
import { ShipState } from '../ship';
import { SpaceState } from '../space';

export interface EventEmitter {
    once(event: string, listener: (e: Event) => void): unknown;
    on(event: string, listener: (e: Event) => void): unknown;
    off(event: string, listener: (e: Event) => void): unknown;
}
export type SpaceEventEmitter = EventEmitter & {
    on(event: '$add', listener: (e: Add) => void): unknown;
    on(event: '$replace', listener: (e: Replace) => void): unknown;
    on(event: '$remove', listener: (e: Remove) => void): unknown;
};

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};
export function makeEventsEmitter(state: ShipState): EventEmitter {
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
