import { ArraySchema, MapSchema, Schema } from '@colyseus/schema';

import { isCommandable, isCommandableFromAncestor } from './game-field';

const jsonPtrRegexp = /^(\/(([^/~])|(~[01]))*)*$/g;
export type JsonStringPointer = string;
const cache = new Map<string, JsonPointer>();

export function isJsonPointer(ptr: unknown): ptr is JsonStringPointer {
    jsonPtrRegexp.lastIndex = 0; // reset regexp state
    return typeof ptr === 'string' && jsonPtrRegexp.test(ptr);
}

export function getJsonPointer(ptr: unknown) {
    const existing = cache.get(ptr as JsonStringPointer);
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

/**
 * JSON Pointer (RFC 6901) implementation compatible with Colyseus@3 data structures.
 * Handles MapSchema (requires .get()), ArraySchema (bracket notation), and Schema objects.
 */
export class JsonPointer {
    readonly pointer: string;
    readonly path: (string | number)[];

    constructor(ptr: string) {
        this.pointer = ptr;
        this.path = JsonPointer.decode(ptr);
    }

    /**
     * Factory method for API compatibility with json-ptr library.
     */
    static create(ptr: string): JsonPointer {
        return new JsonPointer(ptr);
    }

    /**
     * Decodes a JSON Pointer string into path segments.
     * Handles ~1 → / and ~0 → ~ escaping per RFC 6901.
     */
    static decode(ptr: string): (string | number)[] {
        if (ptr === '' || ptr === '/') {
            return [];
        }
        if (!ptr.startsWith('/')) {
            throw new Error(`Invalid JSON Pointer: ${ptr}`);
        }
        return ptr
            .substring(1)
            .split('/')
            .map((segment) => {
                const decoded = segment.replace(/~1/g, '/').replace(/~0/g, '~');
                // Try to parse as number for array indices
                const num = parseInt(decoded, 10);
                return !isNaN(num) && String(num) === decoded ? num : decoded;
            });
    }

    /**
     * Encodes path segments into a JSON Pointer string.
     * Handles ~ → ~0 and / → ~1 escaping per RFC 6901.
     */
    static encode(path: (string | number)[]): string {
        if (path.length === 0) {
            return '';
        }
        return '/' + path.map((segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
    }

    /**
     * Gets the value at this pointer's location in the target object.
     * Handles Colyseus@3 MapSchema, ArraySchema, and Schema objects.
     */
    get(root: unknown): unknown {
        let current: unknown = root;

        for (const segment of this.path) {
            if (current === undefined || current === null) {
                return undefined;
            }

            if (current instanceof MapSchema) {
                current = current.get(String(segment));
            } else if (current instanceof ArraySchema) {
                const index = typeof segment === 'number' ? segment : parseInt(String(segment), 10);
                if (isNaN(index)) {
                    throw new Error(`Invalid array index: ${String(segment)}`);
                }
                current = (current as unknown as unknown[])[index];
            } else if (current instanceof Object) {
                current = (current as Record<string | number, unknown>)[segment];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Sets a value at this pointer's location in the target object.
     * Handles Colyseus@3 MapSchema, ArraySchema, and Schema objects.
     *
     * @param target - The root object to modify
     * @param value - The value to set
     * @param force - If true, creates missing path segments (not supported for Colyseus schemas)
     * @returns The previous value at the location
     */
    set(target: unknown, value: unknown, force?: boolean): unknown {
        if (this.path.length === 0) {
            throw new Error('Cannot set root object');
        }

        // Track each Schema ancestor as we traverse so the commandable
        // ancestor walk can check descendant-admission metadata on them.
        const ancestors: unknown[] = [];
        let current: unknown = target;

        // Traverse all path segments except the last one
        for (let i = 0; i < this.path.length - 1; i++) {
            ancestors.push(current); // capture before step — ancestors[i] has property this.path[i]
            const segment = this.path[i];

            if (current instanceof MapSchema) {
                current = current.get(String(segment));
            } else if (current instanceof ArraySchema) {
                const index = typeof segment === 'number' ? segment : parseInt(String(segment), 10);
                if (isNaN(index)) {
                    throw new Error(`Invalid array index: ${String(segment)}`);
                }
                current = (current as unknown as unknown[])[index];
            } else if (current instanceof Object) {
                const next = (current as Record<string | number, unknown>)[segment];
                if (next === undefined && force) {
                    // Create missing path segment
                    const nextSegment = this.path[i + 1];
                    const newObj = typeof nextSegment === 'number' ? [] : {};
                    (current as Record<string | number, unknown>)[segment] = newObj;
                    current = newObj;
                } else {
                    current = next;
                }
            } else {
                throw new Error(`Cannot traverse path at segment ${String(segment)}`);
            }

            if (current === undefined) {
                throw new Error(`Path segment ${String(segment)} not found`);
            }
        }

        // Set the final property
        const finalSegment = this.path[this.path.length - 1];
        let previousValue: unknown;

        if (current instanceof MapSchema) {
            throw new Error('Cannot set property on MapSchema - target should be an object in the map');
        } else if (current instanceof ArraySchema) {
            const index = typeof finalSegment === 'number' ? finalSegment : parseInt(String(finalSegment), 10);
            if (isNaN(index)) {
                throw new Error(`Invalid array index: ${String(finalSegment)}`);
            }
            previousValue = (current as unknown as unknown[])[index];
            (current as unknown as unknown[])[index] = value;
        } else if (current instanceof Schema) {
            // Whitelist guard: only admitted fields may be written remotely.
            // Admission is checked in three ways (see isCommandable in game-field.ts):
            //   1. @commandable() — explicit player command surface
            //   2. @tweakable — GM tweak panel
            //   3. DesignState subclass — GM design-state panel
            // Plus a fourth path: @commandable({ '/x': true }) on an ancestor
            // property admits writes to a specific descendant sub-pointer.
            if (!isCommandable(current, finalSegment)) {
                // Walk ancestors for descendant-path admission.
                let admitted = false;
                for (let i = ancestors.length - 1; !admitted && i >= 0; i--) {
                    const ancestor = ancestors[i];
                    const propertyKey = this.path[i];
                    if (ancestor instanceof Schema && typeof propertyKey === 'string') {
                        const descendantPath = ['', ...this.path.slice(i + 1)].join('/');
                        admitted = isCommandableFromAncestor(ancestor, propertyKey, descendantPath);
                    }
                }
                if (!admitted) {
                    const ctorName = current.constructor?.name ?? 'Schema';
                    throw new Error(
                        `Refusing to write non-@commandable field ${ctorName}.${String(finalSegment)} ` +
                            `via JSON Pointer ${this.pointer}.`,
                    );
                }
            }
            previousValue = Reflect.get(current, finalSegment);
            // Use Reflect.set to ensure we go through the setter
            Reflect.set(current, finalSegment, value);
        } else if (current instanceof Object) {
            previousValue = (current as Record<string | number, unknown>)[finalSegment];
            (current as Record<string | number, unknown>)[finalSegment] = value;
        } else {
            throw new Error(`Cannot set property ${String(finalSegment)} on non-object`);
        }

        return previousValue;
    }
}
