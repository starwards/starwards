import { GameRoom, readWriteProp } from '..';
import { SpaceObject, SpaceState } from '../space';

import { Primitive } from 'colyseus-events';
import { StateCommand } from '../api';
import { makeSpaceEventsEmitter } from './events';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = makeSpaceEventsEmitter(spaceRoom.state);
    const spaceDriver = {
        events,
        get state(): SpaceState {
            return spaceRoom.state;
        },
        readWriteProp: <T extends Primitive>(subject: SpaceObject, pointerStr: string) =>
            readWriteProp<T>(spaceRoom, events, `/${subject.type}/${subject.id}${pointerStr}`),
        command: <T>(cmd: StateCommand<T, SpaceState, void>, value: T) => {
            spaceRoom.send(cmd.cmdName, { value, path: undefined });
        },
    };
    return spaceDriver;
}
