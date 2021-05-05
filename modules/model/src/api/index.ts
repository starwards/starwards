import { CmdReceiver, StateCommand, StateProperty, cmdReceiver, isStateCommand } from './properties';
import { GameRoom, RoomName, State, Stateful } from '..';

import { Schema } from '@colyseus/schema';

export function cmdSender<T, R extends RoomName>(room: GameRoom<R>, p: StateCommand<T, State<R>>) {
    return (value: T) => room.send(p.cmdName, { value });
}

export function* cmdReceivers<S extends Schema>(
    commands: Record<string, StateCommand<unknown, S> | StateProperty<unknown, S>>,
    manager: Stateful<S>
): Generator<[string, CmdReceiver], void, unknown> {
    for (const prop of Object.values(commands)) {
        if (isStateCommand<unknown, S>(prop)) {
            const c = cmdReceiver<unknown, S>(manager, prop);
            yield [prop.cmdName, c];
        }
    }
}

export * from './properties';
