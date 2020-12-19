import { CmdReceiver, StateCommand, StateProperty, cmdReceiver, isStateCommand } from './properties';
import { GameRoom, RoomName, Stateful } from '..';

export function cmdSender<T, R extends RoomName>(room: GameRoom<R>, p: StateCommand<T, R>) {
    return (value: T) => room.send(p.cmdName, { value });
}

export function* cmdReceivers<R extends RoomName>(
    commands: Record<string, StateCommand<unknown, R> | StateProperty<unknown, R>>,
    manager: Stateful<R>
): Generator<[string, CmdReceiver], void, unknown> {
    for (const prop of Object.values(commands)) {
        if (isStateCommand<unknown, R>(prop)) {
            const c = cmdReceiver<unknown, R>(manager, prop);
            yield [prop.cmdName, c];
        }
    }
}

export * from './properties';
