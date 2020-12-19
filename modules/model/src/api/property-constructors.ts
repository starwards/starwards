import * as types from './properties';

import { RoomName, State } from '..';

import { MapSchema } from '@colyseus/schema';

export function StateProperty<T, R extends RoomName>(getValue: (state: State<R>) => T): types.StateProperty<T, R> {
    return { getValue };
}
export function PropertyCommand<T, R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: T) => unknown
): types.StateCommand<T, R> {
    return { cmdName, setValue };
}
export function NumericStateProperty<R extends RoomName>(
    getValue: (state: State<R>) => number,
    range: [number, number] | ((state: State<R>) => [number, number])
): types.NumericStateProperty<R> {
    return { getValue, range };
}
export function NumericStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: number) => unknown,
    getValue: (state: State<R>) => number,
    range: [number, number] | ((state: State<R>) => [number, number])
): types.NumericStatePropertyCommand<R> {
    return { cmdName, setValue, getValue, range };
}
export function NormalNumericStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: number) => unknown,
    getValue: (state: State<R>) => number
) {
    return NumericStatePropertyCommand(cmdName, setValue, getValue, [0, 1]) as types.NumericStatePropertyCommand<R> &
        types.NormalNumericStateProperty<R>;
}
export function IteratorStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: boolean) => unknown,
    getValue: (state: State<R>) => string
): types.IteratorStatePropertyCommand<R> {
    return { cmdName, setValue, getValue };
}
export function MappedPropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: [string, number]) => unknown,
    getValue: (state: State<R>) => MapSchema<number>
): types.MappedPropertyCommand<R> {
    return { cmdName, setValue, getValue };
}
