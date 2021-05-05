import * as types from './properties';

import { MapSchema, Schema } from '@colyseus/schema';

export function StateProperty<T, S extends Schema, P>(
    getValue: (state: S, path: P) => T
): types.StateProperty<T, S, P> {
    return { getValue };
}
export function PropertyCommand<T, S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: T) => unknown
): types.StateCommand<T, S, void> {
    return { cmdName, setValue };
}
export function StatePropertyCommand<T, S extends Schema, P>(
    cmdName: string,
    setValue: (state: S, value: T, path: P) => unknown,
    getValue: (state: S, path: P) => T
): types.StatePropertyCommand<T, S, P> {
    return { cmdName, setValue, getValue };
}
export function NumericStateProperty<S extends Schema>(
    getValue: (state: S) => number,
    range: [number, number] | ((state: S) => [number, number])
): types.NumericStateProperty<S, void> {
    return { getValue, range };
}
export function NumericStatePropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: number) => unknown,
    getValue: (state: S) => number,
    range: [number, number] | ((state: S) => [number, number])
): types.NumericStatePropertyCommand<S, void> {
    return { cmdName, setValue, getValue, range };
}
export function NormalNumericStatePropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: number) => unknown,
    getValue: (state: S) => number
) {
    return NumericStatePropertyCommand(cmdName, setValue, getValue, [0, 1]) as types.NumericStatePropertyCommand<
        S,
        void
    > &
        types.NormalNumericStateProperty<S, void>;
}
export function IteratorStatePropertyCommand<S extends Schema, P>(
    cmdName: string,
    setValue: (state: S, value: boolean, path: P) => unknown,
    getValue: (state: S, path: P) => string
): types.IteratorStatePropertyCommand<S, P> {
    return { cmdName, setValue, getValue };
}
export function MappedPropertyCommand<S extends Schema>(
    cmdName: string,
    setValue: (state: S, value: [string, number]) => unknown,
    getValue: (state: S) => MapSchema<number>
): types.MappedPropertyCommand<S, void> {
    return { cmdName, setValue, getValue };
}
