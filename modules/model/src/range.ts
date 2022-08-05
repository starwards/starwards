import 'reflect-metadata';

import { JsonPointer } from 'json-ptr';
import { Schema } from '@colyseus/schema';

const rangeMetadataKey = Symbol('rangeMetadata');
export type Range<T extends Schema> = [number, number] | ((target: T) => [number, number]);

export function range<T extends Schema>(r: Range<T>) {
    return (target: T, propertyKey: string | symbol) => {
        Reflect.defineMetadata(rangeMetadataKey, r, target, propertyKey);
    };
}
export function getRange<T extends Schema>(target: T, propertyKey: string): [number, number] {
    const r = Reflect.getMetadata(rangeMetadataKey, target, propertyKey) as Range<T> | undefined;
    if (!r) {
        throw new Error(`property ${propertyKey} in ${String(target)} has no range set!`);
    }
    if (typeof r === 'function') {
        return r(target);
    }
    return r;
}
export function getRangeFromPointer(root: Schema, pointer: JsonPointer): [number, number] {
    const target = pointer.parent(root);
    const propertyName = pointer.path.at(-1);
    if (!(target instanceof Schema) || typeof propertyName !== 'string') {
        throw new Error(
            `pointer ${pointer.pointer} does not point at a legal location: target=${JSON.stringify(
                target
            )}, propertyName=${JSON.stringify(propertyName)}`
        );
    }
    return getRange(target, propertyName);
}
