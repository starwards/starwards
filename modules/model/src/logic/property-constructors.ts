import * as types from './properties';

import { CommandName, RoomName, State } from '..';

import { MapSchema } from '@colyseus/schema';

export function NormalNumericStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: number) => unknown,
    getValue: (state: State<R>) => number
) {
    return NumericStatePropertyCommand(cmdName, setValue, getValue, [0, 1]) as types.NumericStatePropertyCommand<R> &
        types.NormalNumericStateProperty<R>;
}
export function NumericStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: number) => unknown,
    getValue: (state: State<R>) => number,
    range: [number, number] | ((state: State<R>) => [number, number])
): types.NumericStatePropertyCommand<R> {
    return { cmdName: cmdName as CommandName<R>, setValue, getValue, range };
}
export function NumericStateProperty<R extends RoomName>(
    getValue: (state: State<R>) => number,
    range: [number, number] | ((state: State<R>) => [number, number])
): types.NumericStateProperty<R> {
    return { getValue, range };
}
export function StringStateProperty<R extends RoomName>(
    getValue: (state: State<R>) => string
): types.StateProperty<string, 'ship'> {
    return { getValue };
}
export function IteratorStatePropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: boolean) => unknown,
    getValue: (state: State<R>) => string
): types.IteratorStatePropertyCommand<R> {
    return { cmdName: cmdName as CommandName<R>, setValue, getValue };
}
export function MappedPropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: [string, number]) => unknown,
    getValue: (state: State<R>) => MapSchema<number>
): types.MappedPropertyCommand<R> {
    return { cmdName: cmdName as CommandName<R>, setValue, getValue };
}
export function BooleanPropertyCommand<R extends RoomName>(
    cmdName: string,
    setValue: (state: State<R>, value: boolean) => unknown
): types.StateCommand<boolean, R> {
    return { cmdName: cmdName as CommandName<R>, setValue };
}
