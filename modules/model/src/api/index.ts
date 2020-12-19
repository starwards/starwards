import { CmdReceiver, StateCommand, StateProperty, cmdReceiver, isStateCommand } from './properties';
import { Commands, NamedGameRoom, RoomName, State } from '..';

export function cmdSender<T, R extends RoomName>(room: NamedGameRoom<R>, p: StateCommand<T, R>) {
    return (value: T) => room.send(p.cmdName, ({ value } as unknown) as Commands<R>[typeof p.cmdName]);
}

export function* cmdReceivers<R extends RoomName>(
    commands: Record<string, StateCommand<unknown, R> | StateProperty<unknown, R>>,
    manager: { state: State<R> }
): Generator<[string, CmdReceiver], void, unknown> {
    for (const prop of Object.values(commands)) {
        if (isStateCommand<unknown, R>(prop)) {
            const c = cmdReceiver<unknown, R>(manager, prop);
            yield [prop.cmdName as string, c];
        }
    }
}

export * from './properties';
