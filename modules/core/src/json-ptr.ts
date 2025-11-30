import { JsonPointer as JsonPointerImpl } from 'json-ptr';

const jsonPtrRegexp = /^(\/(([^/~])|(~[01]))*)*$/g;

const cache = new Map<string, JsonPointer>();

export function isJsonPointer(ptr: unknown): ptr is string {
    jsonPtrRegexp.lastIndex = 0; // reset regexp state
    return typeof ptr === 'string' && jsonPtrRegexp.test(ptr);
}

export class JsonPointer {
    /**
     * Decodes the specified pointer into path segments.
     * @param pointer a string representation of a JSON Pointer
     */
    static decode(ptr: string): (string | number)[] {
        return JsonPointerImpl.decode(ptr);
    }

    private pointerImpl: JsonPointerImpl;

    constructor(ptr: string) {
        this.pointerImpl = JsonPointerImpl.create(ptr);
    }

    /**
     * This pointer's JSON Pointer encoded string representation.
     */
    get pointer(): string {
        return this.pointerImpl.pointer;
    }

    /**
     * The pointer's decoded path segments.
     */
    get path(): (string | number)[] {
        return this.pointerImpl.path;
    }

    /**
     * Gets the target object's value at the pointer's location.
     * @param target the target of the operation
     */
    get(root: unknown): unknown {
        return this.pointerImpl.get(root);
    }
    /**
     * Sets the target object's value, as specified, at the pointer's location.
     *
     * If any part of the pointer's path does not exist, the operation aborts
     * without modification, unless the caller indicates that pointer's location
     * should be created.
     *
     * @param target the target of the operation
     * @param value the value to set
     * @param force indicates whether the pointer's location should be created if it doesn't already exist.
     */
    set(target: unknown, value: unknown, force?: boolean): unknown {
        return this.pointerImpl.set(target, value, force);
    }
}

export function getJsonPointer(ptr: unknown) {
    const existing = cache.get(ptr as string);
    if (existing) {
        return existing;
    }
    if (isJsonPointer(ptr)) {
        const pointer = new JsonPointer(ptr);
        cache.set(ptr, pointer);
        return pointer;
    }
    return null;
}
