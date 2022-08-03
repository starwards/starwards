import * as types from './properties';

import { JsonPointer, JsonStringPointer } from 'json-ptr';
import { SpaceObject, SpaceState } from '../space';

import { Primitive } from 'colyseus-events';
import { Schema } from '@colyseus/schema';

export function StateProperty<T, S extends Schema, P = void>(
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
export function StatePropertyCommand<T, S extends Schema, P = void>(
    cmdName: string,
    setValue: (state: S, value: T, path: P) => unknown,
    getValue: (state: S, path: P) => T
): types.StatePropertyCommand<T, S, P> {
    return { cmdName, setValue, getValue };
}
export function SpaceObjectProperty<T extends Primitive>(pointerStr: JsonStringPointer): types.SpaceObjectProperty<T> {
    const pointer = JsonPointer.create(pointerStr);
    return {
        pointer,
        eventName: (o: { id: string; type: string }) => `/${o.type}/${o.id}${pointerStr}`,
        cmdName: '$SpaceObject' + pointerStr,
        setValue: (state: SpaceState, value: T, id: string) => pointer.set(state.get(id), value),
        getValueFromObject: (state: SpaceObject): T => pointer.get(state) as T,
    };
}
export function NumericStateProperty<S extends Schema, P = void>(
    getValue: (state: S, path: P) => number,
    range: [number, number] | ((state: S, path: P) => [number, number])
): types.NumericStateProperty<S, P> {
    return { getValue, range };
}
export function NumericStatePropertyCommand<S extends Schema, P = void>(
    cmdName: string,
    setValue: (state: S, value: number, path: P) => unknown,
    getValue: (state: S, path: P) => number,
    range: [number, number] | ((state: S, path: P) => [number, number])
): types.NumericStatePropertyCommand<S, P> {
    return { cmdName, setValue, getValue, range };
}
export function NormalNumericStatePropertyCommand<S extends Schema, P = void>(
    cmdName: string,
    setValue: (state: S, value: number, path: P) => unknown,
    getValue: (state: S, path: P) => number
) {
    return NumericStatePropertyCommand(cmdName, setValue, getValue, [0, 1]) as types.NumericStatePropertyCommand<S, P> &
        types.NormalNumericStateProperty<S, P>;
}
export function IteratorStatePropertyCommand<S extends Schema, P = void>(
    cmdName: string,
    setValue: (state: S, value: boolean, path: P) => unknown,
    getValue: (state: S, path: P) => string
): types.IteratorStatePropertyCommand<S, P> {
    return { cmdName, setValue, getValue };
}
export function MappedPropertyCommand<S extends Schema, P = void, K extends string = string>(
    cmdName: string,
    setValue: (state: S, value: [K, number], path: P) => unknown,
    getValue: (state: S, path: P) => Map<K, number>
): types.MappedPropertyCommand<S, P, K> {
    return { cmdName, setValue, getValue };
}
