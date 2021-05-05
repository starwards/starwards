import * as types from './properties';

import { MapSchema, Schema } from '@colyseus/schema';

export function StateProperty<T, S extends Schema>(getValue: (state: S) => T): types.StateProperty<T, S> {
    return { getValue };
}
export function PropertyCommand<T, S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: T) => unknown
): types.StateCommand<T, S> {
    return { cmdName, setValue };
}
export function NumericStateProperty<S extends Schema>(
    getValue: (state: S) => number,
    range: [number, number] | ((state: S) => [number, number])
): types.NumericStateProperty<S> {
    return { getValue, range };
}
export function NumericStatePropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: number) => unknown,
    getValue: (state: S) => number,
    range: [number, number] | ((state: S) => [number, number])
): types.NumericStatePropertyCommand<S> {
    return { cmdName, setValue, getValue, range };
}
export function NormalNumericStatePropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: number) => unknown,
    getValue: (state: S) => number
) {
    return NumericStatePropertyCommand(cmdName, setValue, getValue, [0, 1]) as types.NumericStatePropertyCommand<S> &
        types.NormalNumericStateProperty<S>;
}
export function IteratorStatePropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: boolean) => unknown,
    getValue: (state: S) => string
): types.IteratorStatePropertyCommand<S> {
    return { cmdName, setValue, getValue };
}
export function MappedPropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: [string, number]) => unknown,
    getValue: (state: S) => MapSchema<number>
): types.MappedPropertyCommand<S> {
    return { cmdName, setValue, getValue };
}
