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
import { withLockBypass } from './lock-registry';

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

/**
 * Message name for the GM tweak panel's write channel — see `handleGmSetValueCommand`. Kept
 * distinct from the plain JSON-pointer channel (`sendJsonCmd`, whose message name IS the
 * pointer) so the server can tell the two apart: the server has no per-connection identity
 * (rooms join with `{}`, no `onAuth`/`sessionId` tracking — see `docs/maintainers.md`'s
 * "Non-goal: malicious-player isolation"), so a GM write is recognised by which channel it
 * used, not by who sent it.
 */
export const GM_SET_VALUE = 'gmSetValue';

/**
 * The GM tweak panel's counterpart to `sendJsonCmd`: same pointer/primitive validation, but
 * sent under `GM_SET_VALUE` so the server routes it through `handleGmSetValueCommand`, which
 * bypasses the property lock. Every other writer (crew stations, bots, MCP, node-red) must
 * keep using `sendJsonCmd` — routing anything else through this function would let it bypass
 * locks it isn't supposed to.
 */
export function sendGmJsonCmd(room: GameRoom<RoomName>, pointerStr: string, value: Primitive) {
    if (!isJsonPointer(pointerStr)) {
        throw new Error(`not a legal Json pointer: ${JSON.stringify(pointerStr)}`);
    }
    if (!isPrimitive(value)) {
        throw new Error(`not a legal value: ${JSON.stringify(value)}`);
    }
    room.send(GM_SET_VALUE, { path: pointerStr, value });
}

/**
 * Server-side handler for `GM_SET_VALUE` messages. Structurally identical to
 * `handleJsonPointerCommand` (resolve the pointer, range-clamp numbers, `pointer.set`), except
 * the write itself runs inside `withLockBypass` — the one and only sanctioned way to write
 * through a locked field. `@commandable` admission gating (invariant I4) is untouched: it still
 * lives inside `JsonPointer.set`, so a GM write to a non-commandable path is refused exactly as
 * a plain client write would be. Only the *lock*, not the write-surface whitelist, is lifted.
 */
export function handleGmSetValueCommand(message: unknown, root: Schema): boolean {
    if (isSetValueCommand(message) && typeof (message as { path: unknown }).path === 'string') {
        const path = (message as { path: string }).path;
        let { value } = message;
        const pointer = getJsonPointer(path);
        if (pointer) {
            try {
                if (typeof value === 'number') {
                    const range = tryGetRange(root, pointer);
                    if (range) {
                        value = capToRange(range[0], range[1], value);
                    }
                }
                withLockBypass(() => pointer.set(root, value));
                return true;
            } catch (e) {
                logError(`Error setting value ${String(value)} in ${path} : ${printError(e)}`);
            }
        } else {
            logError(`GM set-value command for path="${path}" not a valid JSON pointer.`);
        }
    }
    return false;
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
