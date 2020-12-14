import { CommandName, NamedGameRoom, RoomName, State, capToRange } from '..';

import { MapSchema } from '@colyseus/schema';

interface StateCommand<T, S extends RoomName> {
    cmdName: CommandName<S>;
    setValue(state: State<S>, value: T): unknown;
}

export interface StateProperty<T, S extends RoomName> {
    getValue(state: State<S>): T;
}

export interface IteratorStatePropertyCommand<S extends RoomName>
    extends StateProperty<string, S>,
        StateCommand<boolean, S> {}

export interface StatePropertyCommand<T, S extends RoomName> extends StateProperty<T, S>, StateCommand<T, S> {}
export interface NumericStateProperty<S extends RoomName> extends StateProperty<number, S> {
    range: [number, number] | ((state: State<S>) => [number, number]);
}
export interface NormalNumericStateProperty<S extends RoomName> extends NumericStateProperty<S> {
    range: [0, 1];
}

export function isNormalNumericStateProperty<S extends RoomName>(
    v: NumericStateProperty<S>
): v is NormalNumericStateProperty<S> {
    return typeof v.range === 'object' && v.range[0] === 0 && v.range[1] === 1;
}
export function isStatePropertyCommand<T, S extends RoomName>(
    v: StateProperty<unknown, S>
): v is StatePropertyCommand<T, S> {
    return !!(v as StatePropertyCommand<T, S>).cmdName;
}
export function isNumericStatePropertyCommandy<S extends RoomName>(
    v: StateProperty<unknown, S>
): v is NumericStatePropertyCommand<S> {
    return !!(v as NumericStatePropertyCommand<S>).range && isStatePropertyCommand(v);
}
export interface NumericStatePropertyCommand<S extends RoomName>
    extends NumericStateProperty<S>,
        StatePropertyCommand<number, S> {}

export interface MappedPropertyCommand<S extends RoomName>
    extends StateProperty<MapSchema<number>, S>,
        StateCommand<[string, number], S> {}

export function setNumericProperty(
    manager: { state: State<'ship'> },
    p: NumericStatePropertyCommand<'ship'>,
    value: number
) {
    const range = typeof p.range === 'function' ? p.range(manager.state) : p.range;
    p.setValue(manager.state, capToRange(range[0], range[1], value));
}

export type StatePropertyValue<T> = T extends StatePropertyCommand<infer R, never> ? R : never;
export function cmdSender<T>(shipRoom: NamedGameRoom<'ship'>, p: StateCommand<T, 'ship'>) {
    return (value: T) => shipRoom.send(p.cmdName, { value });
}

export function cmdReceiver<T>(
    manager: { state: State<'ship'> },
    p: StatePropertyCommand<T, 'ship'>
): (_: unknown, m: { value: T }) => unknown {
    if (isNumericStatePropertyCommandy(p)) {
        return (_: unknown, { value }: { value: T }) => setNumericProperty(manager, p, (value as unknown) as number);
    } else {
        return (_: unknown, { value }: { value: T }) => p.setValue(manager.state, value);
    }
}
