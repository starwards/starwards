import { EventEmitter } from './events';

function once<K extends string>(events: EventEmitter<Record<K, unknown>>, event: K) {
    return new Promise((res) => events.once(event, res));
}

export function waitForEvents<K extends string>(events: EventEmitter<Record<K, unknown>>, eventNames: K[]) {
    return Promise.all(eventNames.map((eventName) => once(events, eventName)));
}
export function raceEvents<K extends string>(events: EventEmitter<Record<K, unknown>>, eventNames: K[]) {
    return Promise.race(eventNames.map((eventName) => once(events, eventName)));
}
