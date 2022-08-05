import { JsonPointer } from 'json-ptr';

const jsonPtrRegexp = /^(\/(([^/~])|(~[01]))+)+$/g;

const cache = new Map<string, JsonPointer>();

export function getJsonPointer(ptr: unknown) {
    const existing = cache.get(ptr as string);
    if (existing) {
        return existing;
    }
    if (typeof ptr === 'string' && jsonPtrRegexp.test(ptr)) {
        const pointer = new JsonPointer(ptr);
        cache.set(ptr, pointer);
        return pointer;
    }
    return null;
}
