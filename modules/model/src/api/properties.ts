import { SpaceObject, SpaceState, Stateful, capToRange } from '..';

import { JsonPointer } from 'json-ptr';
import { Primitive } from 'colyseus-events';
import { Schema } from '@colyseus/schema';

export interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}

export interface StateProperty<T, S extends Schema, P> {
    getValue(state: S, path: P): T;
}

export type SpaceObjectProperty<T extends Primitive> = StateCommand<T, SpaceState, string> & {
    pointer: JsonPointer;
    eventName: (o: { id: string; type: string }) => string;
    getValueFromObject: (state: SpaceObject) => T;
};

export interface IteratorStatePropertyCommand<S extends Schema, P>
    extends StateProperty<string, S, P>,
        StateCommand<boolean, S, P> {}

export interface StatePropertyCommand<T, S extends Schema, P> extends StateProperty<T, S, P>, StateCommand<T, S, P> {}
export interface NumericStateProperty<S extends Schema, P> extends StateProperty<number, S, P> {
    range: [number, number] | ((state: S, path: P) => [number, number]);
}
export interface NormalNumericStateProperty<S extends Schema, P> extends NumericStateProperty<S, P> {
    range: [0, 1];
}

export function isNormalNumericStateProperty<S extends Schema, P>(
    v: NumericStateProperty<S, P>
): v is NormalNumericStateProperty<S, P> {
    return typeof v.range === 'object' && v.range[0] === 0 && v.range[1] === 1;
}
export function isStatePropertyCommand<T, S extends Schema, P>(
    v: StateProperty<unknown, S, P>
): v is StatePropertyCommand<T, S, P> {
    return (
        typeof (v as StatePropertyCommand<T, S, P>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S, P>).setValue === 'function'
    );
}

export function isStateCommand<T, S extends Schema, P>(v: unknown): v is StateCommand<T, S, P> {
    return (
        !!v &&
        typeof (v as StatePropertyCommand<T, S, P>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S, P>).setValue === 'function'
    );
}

export function isNumericStatePropertyCommand<S extends Schema, P>(v: unknown): v is NumericStatePropertyCommand<S, P> {
    return isNumericStateProperty(v) && isStatePropertyCommand(v);
}

export function isNumericStateProperty<S extends Schema, P>(v: unknown): v is NumericStateProperty<S, P> {
    return (
        !!v &&
        typeof (v as NumericStateProperty<S, P>).getValue === 'function' &&
        !!(v as NumericStateProperty<S, P>).range
    );
}
export interface NumericStatePropertyCommand<S extends Schema, P>
    extends NumericStateProperty<S, P>,
        StatePropertyCommand<number, S, P> {}

export interface MappedPropertyCommand<S extends Schema, P, K extends string>
    extends StateProperty<Map<K, number>, S, P>,
        StateCommand<[K, number], S, P> {}

export function setNumericProperty<S extends Schema, P>(
    manager: Stateful<S>,
    p: NumericStatePropertyCommand<S, P>,
    value: number,
    path: P
) {
    const range = typeof p.range === 'function' ? p.range(manager.state, path) : p.range;
    p.setValue(manager.state, capToRange(range[0], range[1], value), path);
}

export type StatePropertyValue<T> = T extends StatePropertyCommand<infer R, never, never> ? R : never;
