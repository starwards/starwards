import 'reflect-metadata';

import { JsonPointer } from 'json-ptr';
import { RTuple2 } from './logic/formulas';
import { MapSchema, Schema } from '@colyseus/schema';
import { getJsonPointer } from './json-ptr';

const propertyMetadataKey = Symbol('range:propertyMetadata');
const descendantMetadataKey = Symbol('range:descendantMetadata');

// notice: `Schema` can be replaced with `Object` if we want to have ranges in non-schema classes. Currently not a use-case.

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type Constructor = { readonly prototype: Schema } & Function; // https://stackoverflow.com/a/38642922

type SchemaRanges = {
    [pointer: string]: Range<Schema>;
};
type Range<T extends Schema> = RTuple2 | ((target: T) => RTuple2);

function isRange<T extends Schema>(r: Range<T> | SchemaRanges): r is Range<T> {
    return typeof r === 'function' || Array.isArray(r);
}
export function rangeSchema(r: SchemaRanges) {
    return (target: Constructor) => {
        for (const [k, v] of Object.entries<Range<Schema>>(r)) {
            const path = JsonPointer.decode(k);
            if (path.length === 1) {
                Reflect.defineMetadata(propertyMetadataKey, v, target.prototype as Schema, String(path[0]));
            } else {
                appendDecendantRange(target.prototype as Schema, String(path[0]), {
                    [['', ...path.slice(1)].join('/')]: v,
                });
            }
        }
    };
}

export function range<T extends Schema>(r: Range<T> | SchemaRanges) {
    if (isRange(r)) {
        return (target: T, propertyKey: string | symbol) => {
            Reflect.defineMetadata(propertyMetadataKey, r, target, propertyKey);
        };
    } else {
        return (target: Schema, propertyKey: string | symbol) => {
            appendDecendantRange(target, propertyKey, r);
        };
    }
}

function appendDecendantRange(target: Schema, propertyKey: string | symbol, r: SchemaRanges) {
    const ranges = (Reflect.getMetadata(descendantMetadataKey, target, propertyKey) || {}) as SchemaRanges;
    Reflect.defineMetadata(descendantMetadataKey, { ...ranges, ...r }, target, propertyKey);
}

function getRangeFromProperty<T extends Schema>(target: T, propertyKey: string): RTuple2 | undefined {
    const r = Reflect.getMetadata(propertyMetadataKey, target, propertyKey) as Range<T> | undefined;
    if (typeof r === 'function') {
        return r(target);
    }
    return r;
}

function getRangeFromAncestor<T extends Schema>(
    ancestor: T,
    propertyKey: string,
    descendantPath: string,
): RTuple2 | undefined {
    const ranges = Reflect.getMetadata(descendantMetadataKey, ancestor, propertyKey) as SchemaRanges | undefined;
    if (ranges) {
        const r = ranges[descendantPath];
        if (r) {
            if (typeof r === 'function') {
                return r(ancestor);
            }
            return r;
        }
    }
    return undefined;
}

export function getRange(root: Schema, pointer: JsonPointer): RTuple2 {
    const r = tryGetRange(root, pointer);
    if (!r) {
        throw new Error(`pointer ${pointer.pointer} has no range set!`);
    }
    return r;
}

/**
 * Get the parent object by traversing the path, handling MapSchema correctly
 */
function getParent(root: Schema, path: readonly (string | number)[]): unknown {
    let current: unknown = root;
    
    // Traverse all path segments except the last one (which is the property we're looking for)
    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        
        if (current instanceof MapSchema) {
            // MapSchema requires .get() method
            current = current.get(String(segment));
        } else if (current instanceof Object) {
            // Regular object property access
            current = (current as Record<string | number, unknown>)[segment];
        } else {
            return undefined;
        }
        
        if (current === undefined) {
            return undefined;
        }
    }
    
    return current;
}

export function tryGetRange(root: Schema, pointer: JsonPointer): undefined | RTuple2 {
    const target = pointer.path.length === 1 ? root : getParent(root, pointer.path);
    const propertyName = pointer.path.at(-1);
    if (!(target instanceof Object) || typeof propertyName !== 'string') {
        throw new Error(
            `pointer ${pointer.pointer} does not point at a legal location: target=${JSON.stringify(
                target,
            )}, propertyName=${JSON.stringify(propertyName)}`,
        );
    }
    if (!(target instanceof Schema)) {
        return undefined;
    }
    let r = getRangeFromProperty(target, propertyName);
    // while no range was found, look for range in ancestors
    for (let i = pointer.path.length - 2; !r && i >= 0; i--) {
        const ancestorPath = ['', ...pointer.path.slice(0, i)].join('/');
        const ancestorPropertyName = pointer.path.at(i);
        const descendantPath = ['', ...pointer.path.slice(i + 1)].join('/');
        const ancestorPointer = getJsonPointer(ancestorPath);
        if (!ancestorPointer) {
            throw new Error(`Unexpected! ${ancestorPath} is an illegal json pointer`);
        }
        const ancestor = ancestorPointer.get(root);
        if (!(ancestor instanceof Object) || typeof ancestorPropertyName !== 'string') {
            throw new Error(
                `pointer ${pointer.pointer} does not point at a legal location: ancestor=${JSON.stringify(
                    ancestor,
                )}, ancestorPropertyName=${JSON.stringify(ancestorPropertyName)}`,
            );
        }
        if (ancestor instanceof Schema) {
            r = getRangeFromAncestor(ancestor, ancestorPropertyName, descendantPath);
        }
    }
    return r;
}
