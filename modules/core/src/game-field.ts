/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { DefinitionType, Schema, type } from '@colyseus/schema';

/**
 * Marker symbol used to record the set of fields a Schema subclass exposes
 * to the JSON Pointer command surface. The set is stored on the
 * constructor; subclasses inherit it via the prototype chain.
 *
 * Using Symbol.for(...) (registered symbol) so the same key is reachable
 * across module instances if a consumer ever ends up with two copies of
 * @starwards/core (e.g. in a misconfigured monorepo).
 */
export const COMMANDABLE_FIELDS = Symbol.for('starwards.commandable');

type SchemaCtor = (new (...args: unknown[]) => Schema) & {
    [COMMANDABLE_FIELDS]?: Set<string>;
};

/**
 * Decorator that marks a `@gameField` as remotely writable through the
 * JSON Pointer command surface (`handleJsonPointerCommand` /
 * `JsonPointer.set`). Apply ABOVE `@gameField` (i.e. earlier in source
 * order, since decorators run innermost-first):
 *
 *     @range([0, 1])
 *     @tweakable('number')
 *     @commandable
 *     @gameField('float32')
 *     power = 1.0;
 *
 * A `@gameField` without `@commandable` is still synced to clients but
 * the JSON Pointer setter will reject any client write to it. This makes
 * the remote-write surface explicit and grep-able.
 */
export const commandable: PropertyDecorator = (target: object, field: string | symbol) => {
    if (typeof field !== 'string') {
        return;
    }
    const ctor = (target as { constructor: SchemaCtor }).constructor;
    // Use hasOwnProperty so subclasses get their own Set instead of
    // mutating a parent class's Set in place.
    if (!Object.prototype.hasOwnProperty.call(ctor, COMMANDABLE_FIELDS)) {
        const inherited = ctor[COMMANDABLE_FIELDS];
        ctor[COMMANDABLE_FIELDS] = new Set<string>(inherited ?? []);
    }
    ctor[COMMANDABLE_FIELDS]!.add(field);
};

/**
 * Returns true if `field` is marked `@commandable` on the runtime class of
 * `instance` (or any superclass thereof). Walks the prototype chain so that
 * subclasses inherit parent allowlists.
 */
export function isCommandable(instance: object, field: string | number | symbol): boolean {
    if (instance === null || typeof instance !== 'object') {
        return false;
    }
    const fieldStr = String(field);
    let proto = Object.getPrototypeOf(instance) as object | null;
    while (proto && proto !== Object.prototype) {
        const ctor = proto.constructor as SchemaCtor | undefined;
        if (ctor && Object.prototype.hasOwnProperty.call(ctor, COMMANDABLE_FIELDS)) {
            const set = ctor[COMMANDABLE_FIELDS];
            if (set && set.has(fieldStr)) {
                return true;
            }
        }
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return false;
}

const number2Digits = ((target: typeof Schema, field: string) => {
    // First, let Colyseus set up the field
    type('float32')(target, field);

    // wrap the Colyseus setter to add rounding
    // Get the descriptor that Colyseus just created
    const colyseusDescriptor = Object.getOwnPropertyDescriptor(target, field);

    if (colyseusDescriptor?.set) {
        // Wrap the Colyseus setter
        const colyseusSetter = colyseusDescriptor.set;
        Object.defineProperty(target, field, {
            get: colyseusDescriptor.get,
            set(this: Schema, value: number) {
                // Round to 2 decimal places before passing to Colyseus
                const rounded = Math.round(value * 1e2) / 1e2;
                colyseusSetter.call(this, rounded);
            },
            enumerable: colyseusDescriptor.enumerable,
            configurable: colyseusDescriptor.configurable,
        });
    } else {
        // If Colyseus didn't create a setter (shouldn't happen in normal usage),
        // fall back to the _definition approach for v2 compatibility
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const definition = (target.constructor as any)._definition;

        if (definition?.descriptors?.[field]) {
            const oldSetter = definition.descriptors[field].set;

            definition.descriptors[field].set = function (this: Schema, value: number) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
            };
        }
    }
}) as PropertyDecorator;

export const gameField = (dt: DefinitionType) => {
    if (dt === 'float32') {
        return number2Digits;
    } else return type(dt);
};
