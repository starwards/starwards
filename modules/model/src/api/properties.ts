import { MapSchema, Schema } from '@colyseus/schema';
import { Stateful, capToRange } from '..';

export interface StateCommand<T, S extends Schema> {
    cmdName: string;
    setValue(state: S, value: T): unknown;
}

export interface StateProperty<T, S extends Schema> {
    getValue(state: S): T;
}

export interface IteratorStatePropertyCommand<S extends Schema>
    extends StateProperty<string, S>,
        StateCommand<boolean, S> {}

export interface StatePropertyCommand<T, S extends Schema> extends StateProperty<T, S>, StateCommand<T, S> {}
export interface NumericStateProperty<S extends Schema> extends StateProperty<number, S> {
    range: [number, number] | ((state: S) => [number, number]);
}
export interface NormalNumericStateProperty<S extends Schema> extends NumericStateProperty<S> {
    range: [0, 1];
}

export function isNormalNumericStateProperty<S extends Schema>(
    v: NumericStateProperty<S>
): v is NormalNumericStateProperty<S> {
    return typeof v.range === 'object' && v.range[0] === 0 && v.range[1] === 1;
}
export function isStatePropertyCommand<T, S extends Schema>(
    v: StateProperty<unknown, S>
): v is StatePropertyCommand<T, S> {
    return (
        typeof (v as StatePropertyCommand<T, S>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S>).setValue === 'function'
    );
}

export function isStateCommand<T, S extends Schema>(v: unknown): v is StateCommand<T, S> {
    return (
        !!v &&
        typeof (v as StatePropertyCommand<T, S>).cmdName === 'string' &&
        typeof (v as StatePropertyCommand<T, S>).setValue === 'function'
    );
}

export function isNumericStatePropertyCommand<S extends Schema>(v: unknown): v is NumericStatePropertyCommand<S> {
    return isNumericStateProperty(v) && isStatePropertyCommand(v);
}

export function isNumericStateProperty<S extends Schema>(v: unknown): v is NumericStateProperty<S> {
    return (
        !!v && typeof (v as NumericStateProperty<S>).getValue === 'function' && !!(v as NumericStateProperty<S>).range
    );
}
export interface NumericStatePropertyCommand<S extends Schema>
    extends NumericStateProperty<S>,
        StatePropertyCommand<number, S> {}

export interface MappedPropertyCommand<S extends Schema>
    extends StateProperty<MapSchema<number>, S>,
        StateCommand<[string, number], S> {}

export function setNumericProperty<S extends Schema>(
    manager: Stateful<S>,
    p: NumericStatePropertyCommand<S>,
    value: number
) {
    const range = typeof p.range === 'function' ? p.range(manager.state) : p.range;
    p.setValue(manager.state, capToRange(range[0], range[1], value));
}

export type StatePropertyValue<T> = T extends StatePropertyCommand<infer R, never> ? R : never;

export function cmdReceiver<T, S extends Schema>(
    manager: Stateful<S>,
    p: StateCommand<T, S>
): (_: unknown, m: { value: T }) => unknown {
    if (isNumericStatePropertyCommand(p)) {
        return (_: unknown, { value }: { value: T }) => setNumericProperty(manager, p, (value as unknown) as number);
    } else {
        return (_: unknown, { value }: { value: T }) => p.setValue(manager.state, value);
    }
}
export type CmdReceiver = ReturnType<typeof cmdReceiver>;
