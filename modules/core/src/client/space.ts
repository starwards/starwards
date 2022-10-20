import { StateCommand, sendJsonCmd } from '../api';

import { GameRoom } from '..';
import { Primitive } from 'colyseus-events';
import { SpaceState } from '../space';
import { makeSpaceEventsEmitter } from './events';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = makeSpaceEventsEmitter(spaceRoom.state);
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
