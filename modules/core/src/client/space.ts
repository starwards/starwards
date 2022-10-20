import { Event, Primitive } from 'colyseus-events';
import { GameRoom, readWriteProp } from '..';
import { SpaceObject, SpaceState } from '../space';

import { StateCommand } from '../api';
import { makeSpaceEventsEmitter } from './events';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = makeSpaceEventsEmitter(spaceRoom.state);
    const spaceDriver = {
        events,
        [Symbol.iterator]() {
            return spaceRoom.state[Symbol.iterator]();
        },
        get state(): SpaceState {
            return spaceRoom.state;
        },
        waitForObject(id: string): Promise<SpaceObject> {
            const tracked = spaceDriver.state.get(id);
            if (tracked) {
                return Promise.resolve(tracked);
            } else {
                return new Promise((res) => {
                    const tracker = (event: Event) => {
                        if (event.op === 'add') {
                            events.off('/' + id, tracker);
                            res(event.value as SpaceObject);
                        }
                    };
                    events.on('/' + id, tracker);
                });
            }
        },
        readWriteProp: <T extends Primitive>(subject: SpaceObject, pointerStr: string) =>
            readWriteProp<T>(spaceRoom, events, `/${subject.type}/${subject.id}${pointerStr}`),
        command: <T>(cmd: StateCommand<T, SpaceState, void>, value: T) => {
            spaceRoom.send(cmd.cmdName, { value, path: undefined });
        },
    };
    return spaceDriver;
}
