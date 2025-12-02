import { Add, Event, Primitive, Remove, Replace, wireEvents } from 'colyseus-events';
import { EventEmitter, RoomEventEmitter } from '..';
import { StateCommand, sendJsonCmd } from '../commands';

import EventEmitter2 from 'eventemitter2';
import { Room } from 'colyseus.js';
import { SpaceState } from '../space';

export type SpaceDriver = Awaited<ReturnType<typeof SpaceDriver>>;
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
export async function SpaceDriver(spaceRoom: Room<SpaceState>) {
    const events = new EventEmitter2(emitter2Options) as SpaceEventEmitter;
    // wire objects lifecycle events
    events.on('/*', (e: Event) => {
        events.emit(`$${e.op}`, e);
    });
    events.on('/*/*/destroyed', (e: Event) => {
        if (e.op === 'replace' && e.value) {
            events.emit(`$remove`, Remove(e.path.slice(0, e.path.lastIndexOf('/'))));
        }
    });
    // IMPORTANT: colyseus-events v4 requires passing the room instead of room.state
    // We must wait for the first state sync before calling wireEvents because:
    // 1. The room's state may not be fully initialized immediately after connection
    // 2. Reference IDs (refIds) need to be set up for proper object tracking
    // 3. wireEvents needs access to the full state tree to set up listeners
    await new Promise<void>((resolve) => {
        spaceRoom.onStateChange.once(() => {
            wireEvents(spaceRoom, events);
            resolve();
        });
    });
    const spaceDriver = {
        events,
        get state(): SpaceState {
            return spaceRoom.state;
        },
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(spaceRoom, pointerStr, value),
        command: <T>(cmd: StateCommand<T, SpaceState, void>, value: T) => {
            spaceRoom.send(cmd.cmdName, { value, path: undefined });
        },
    };
    return spaceDriver;
}
