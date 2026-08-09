import {
    GameRoom,
    RTuple2,
    RoomName,
    Stateful,
    capToRange,
    getJsonPointer,
    isJsonPointer,
    printError,
    tryGetRange,
} from '.';
import { Primitive, isPrimitive } from 'colyseus-events';

import { Schema } from '@colyseus/schema';
import { createLogger } from './logger';

const { error: logError } = createLogger('commands');

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
    range: RTuple2 | ((state: Schema, path: unknown) => RTuple2);
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
 * Structural check for `ShipState`-shaped lock support, without importing `ShipState` itself —
 * `commands.ts` is shared by every room type (ship/space/admin), while property locks are a
 * ship-only concept today (see `ship/property-lock.ts`).
 */
function isLockableState(root: Schema): root is Schema & { lockedPaths: { includes(path: string): boolean } } {
    const lockedPaths = (root as { lockedPaths?: unknown }).lockedPaths;
    return !!lockedPaths && typeof (lockedPaths as { includes?: unknown }).includes === 'function';
}

export function handleJsonPointerCommand(message: unknown, type: string | number, root: Schema) {
    if (isSetValueCommand(message)) {
        let { value } = message;
        const pointer = getJsonPointer(type);
        if (pointer) {
            if (isLockableState(root) && root.lockedPaths.includes(String(type))) {
                // GM value wins: silently ignore writes to a locked path until it's unlocked.
                return true;
            }
            try {
                if (typeof value === 'number') {
                    const range = tryGetRange(root, pointer);
                    if (range) {
                        value = capToRange(range[0], range[1], value);
                    }
                }
                pointer.set(root, value);
                return true;
            } catch (e) {
                logError(`Error setting value ${String(value)} in ${type} : ${printError(e)}`);
            }
        } else {
            logError(`onMessage for type="${type}" not registered.`);
        }
    }
    return false;
}
