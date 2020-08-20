import EventEmitter from 'eventemitter3';

export function once(events: EventEmitter, event: string) {
    return new Promise((res) => events.once(event, res));
}

export function waitForEvents(events: EventEmitter, eventNames: string[]) {
    return Promise.all(eventNames.map((eventName) => once(events, eventName)));
}

export function emitAll(events: EventEmitter) {
    for (const eventName of events.eventNames()) {
        events.emit(eventName);
    }
}
