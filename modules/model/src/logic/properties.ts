import { CommandName, Commands, NamedGameRoom, RoomName, State, capToRange } from '..';

import { MapSchema } from '@colyseus/schema';

export interface StateCommand<T, S extends RoomName> {
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
    return (
        typeof (v as StatePropertyCommand<T, S>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S>).setValue === 'function'
    );
}

export function isStateCommand<T, S extends RoomName>(v: unknown): v is StatePropertyCommand<T, S> {
    return (
        !!v &&
        typeof (v as StatePropertyCommand<T, S>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S>).setValue === 'function'
    );
}

export function isNumericStatePropertyCommand<S extends RoomName>(v: unknown): v is NumericStatePropertyCommand<S> {
    return isNumericStateProperty(v) && isStatePropertyCommand(v);
}

export function isNumericStateProperty<S extends RoomName>(v: unknown): v is NumericStateProperty<S> {
    return (
        !!v && typeof (v as NumericStateProperty<S>).getValue === 'function' && !!(v as NumericStateProperty<S>).range
    );
}
export interface NumericStatePropertyCommand<S extends RoomName>
    extends NumericStateProperty<S>,
        StatePropertyCommand<number, S> {}

export interface MappedPropertyCommand<S extends RoomName>
    extends StateProperty<MapSchema<number>, S>,
        StateCommand<[string, number], S> {}

export function setNumericProperty<R extends RoomName>(
    manager: { state: State<R> },
    p: NumericStatePropertyCommand<R>,
    value: number
) {
    const range = typeof p.range === 'function' ? p.range(manager.state) : p.range;
    p.setValue(manager.state, capToRange(range[0], range[1], value));
}

export type StatePropertyValue<T> = T extends StatePropertyCommand<infer R, never> ? R : never;
export function cmdSender<T, R extends 'ship' | 'admin'>(room: NamedGameRoom<R>, p: StateCommand<T, R>) {
    return (value: T) => room.send(p.cmdName, ({ value } as unknown) as Commands<R>[typeof p.cmdName]);
}

export function cmdReceiver<T, R extends RoomName>(
    manager: { state: State<R> },
    p: StateCommand<T, R>
): (_: unknown, m: { value: T }) => unknown {
    if (isNumericStatePropertyCommand(p)) {
        return (_: unknown, { value }: { value: T }) => setNumericProperty(manager, p, (value as unknown) as number);
    } else {
        return (_: unknown, { value }: { value: T }) => p.setValue(manager.state, value);
    }
}
