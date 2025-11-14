import { GameRoom, RoomName, Stateful, capToRange, getJsonPointer, isJsonPointer, printError, tryGetRange } from '.';
import { Primitive, isPrimitive } from 'colyseus-events';

import { MapSchema, Schema } from '@colyseus/schema';

export interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}

function isStateCommand(v: unknown): v is StateCommand<unknown, Schema, unknown> {
    return (
        !!v &&
        typeof (v as StateCommand<unknown, Schema, unknown>).cmdName === 'string' &&
        typeof (v as StateCommand<unknown, Schema, unknown>).setValue === 'function'
    );
}

export function sendJsonCmd(room: GameRoom<RoomName>, pointerStr: string, value: Primitive) {
    if (!isJsonPointer(pointerStr)) {
        throw new Error(`not a legal Json pointer: ${JSON.stringify(pointerStr)}`);
    }
    if (!isPrimitive(value)) {
        throw new Error(`not a legal value: ${JSON.stringify(value)}`);
    }
    room.send(pointerStr, { value });
}

export function cmdSender<T, R extends RoomName, P = void>(room: GameRoom<R>, p: { cmdName: string }, path: P) {
    return (value: T) => room.send(p.cmdName, { value, path });
}

export function* cmdReceivers<S extends Schema>(
    commands: Record<string, unknown>,
    manager: Stateful<S>,
): Generator<[string, CmdReceiver], void, unknown> {
    for (const prop of Object.values(commands)) {
        if (isStateCommand(prop)) {
            const c = cmdReceiver<unknown, Schema, unknown>(manager, prop);
            yield [prop.cmdName, c];
        }
    }
}
function isNumericStatePropertyCommand(v: unknown): v is NumericStatePropertyCommand {
    return (
        !!v &&
        typeof (v as NumericStatePropertyCommand).getValue === 'function' &&
        !!(v as NumericStatePropertyCommand).range &&
        typeof (v as NumericStatePropertyCommand).cmdName === 'string' &&
        typeof (v as NumericStatePropertyCommand).setValue === 'function'
    );
}

type NumericStatePropertyCommand = {
    cmdName: string;
    setValue(state: Schema, value: number, path: unknown): unknown;
    getValue(state: Schema, path: unknown): number;
    range: [number, number] | ((state: Schema, path: unknown) => [number, number]);
};

function setNumericProperty<S extends Schema, P>(
    manager: Stateful<S>,
    p: NumericStatePropertyCommand,
    value: number,
    path: P,
) {
    const range = typeof p.range === 'function' ? p.range(manager.state, path) : p.range;
    p.setValue(manager.state, capToRange(range[0], range[1], value), path);
}

export function cmdReceiver<T, S extends Schema, P>(
    manager: Stateful<S>,
    p: StateCommand<T, S, P>,
): (_: unknown, m: { value: T; path: P }) => unknown {
    if (isNumericStatePropertyCommand(p)) {
        return (_: unknown, { value, path }: { value: T; path: P }) =>
            setNumericProperty(manager, p, value as unknown as number, path);
    } else {
        return (_: unknown, { value, path }: { value: T; path: P }) => p.setValue(manager.state, value, path);
    }
}

export type CmdReceiver = ReturnType<typeof cmdReceiver>;

export type SetValueCommand = { value: unknown; path?: unknown };
export function isSetValueCommand(val: unknown): val is SetValueCommand {
    return (val as { value: unknown })?.value !== undefined;
}

/**
 * Set a value using JSON pointer path, handling MapSchema correctly
 */
function setByPointer(root: Schema, path: readonly (string | number)[], value: unknown): void {
    if (path.length === 0) {
        throw new Error('Cannot set root object');
    }
    
    let current: unknown = root;
    
    // Traverse all path segments except the last one
    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        
        if (current instanceof MapSchema) {
            // MapSchema requires .get() method
            current = current.get(String(segment));
        } else if (current instanceof Object) {
            // Regular object property access
            current = (current as Record<string | number, unknown>)[segment];
        } else {
            throw new Error(`Cannot traverse path at segment ${String(segment)}`);
        }
        
        if (current === undefined) {
            throw new Error(`Path segment ${String(segment)} not found`);
        }
    }
    
    // Set the final property
    const finalSegment = path[path.length - 1];
    if (current instanceof MapSchema) {
        throw new Error('Cannot set property on MapSchema - target should be an object in the map');
    } else if (current instanceof Object) {
        (current as Record<string | number, unknown>)[finalSegment] = value;
    } else {
        throw new Error(`Cannot set property ${String(finalSegment)} on non-object`);
    }
}

export function handleJsonPointerCommand(message: unknown, type: string | number, root: Schema) {
    if (isSetValueCommand(message)) {
        let { value } = message;
        const pointer = getJsonPointer(type);
        if (pointer) {
            try {
                if (typeof value === 'number') {
                    const range = tryGetRange(root, pointer);
                    if (range) {
                        value = capToRange(range[0], range[1], value);
                    }
                }
                setByPointer(root, pointer.path, value);
                return true;
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error(`Error setting value ${String(value)} in ${type} : ${printError(e)}`);
            }
        } else {
            // eslint-disable-next-line no-console
            console.error(`onMessage for type="${type}" not registered.`);
        }
    }
    return false;
}
