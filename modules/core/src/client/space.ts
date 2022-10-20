import { Add, Event, Primitive, Remove, Replace, wireEvents } from 'colyseus-events';
import { EventEmitter, GameRoom, RoomEventEmitter } from '..';
import { StateCommand, sendJsonCmd } from '../commands';

import EventEmitter2 from 'eventemitter2';
import { SpaceState } from '../space';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;
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
export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
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
    wireEvents(spaceRoom.state, events);
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
