import { JsonPointer } from 'json-ptr';

const jsonPtrRegexp = /^(\/(([^/~])|(~[01]))*)*$/g;

const cache = new Map<string, JsonPointer>();

export function isJsonPointer(ptr: unknown): ptr is string {
    jsonPtrRegexp.lastIndex = 0; // reset regexp state
    return typeof ptr === 'string' && jsonPtrRegexp.test(ptr);
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
