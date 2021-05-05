import { GameRoom, RoomName, State, Stateful } from '..';
import {
    StateCommand,
    StateProperty,
    isNumericStatePropertyCommand,
    isStateCommand,
    setNumericProperty,
} from './properties';

import { Schema } from '@colyseus/schema';

export function cmdSender<T, R extends RoomName, P = void>(
    room: GameRoom<R>,
    p: StateCommand<T, State<R>, P>,
    path: P
) {
    return (value: T) => room.send(p.cmdName, { value, path });
}

export function* cmdReceivers<S extends Schema>(
    commands: Record<string, StateCommand<unknown, S, unknown> | StateProperty<unknown, S, unknown>>,
    manager: Stateful<S>
): Generator<[string, CmdReceiver], void, unknown> {
    for (const prop of Object.values(commands)) {
        if (isStateCommand<unknown, S, unknown>(prop)) {
            const c = cmdReceiver<unknown, S, unknown>(manager, prop);
            yield [prop.cmdName, c];
        }
    }
}

export function cmdReceiver<T, S extends Schema, P>(
    manager: Stateful<S>,
    p: StateCommand<T, S, P>
): (_: unknown, m: { value: T; path: P }) => unknown {
    if (isNumericStatePropertyCommand(p)) {
        return (_: unknown, { value, path }: { value: T; path: P }) =>
            setNumericProperty(manager, p, (value as unknown) as number, path);
    } else {
        return (_: unknown, { value, path }: { value: T; path: P }) => p.setValue(manager.state, value, path);
    }
}
export type CmdReceiver = ReturnType<typeof cmdReceiver>;
