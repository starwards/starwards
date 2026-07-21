import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

const tweakablePropertyMetadataKey = Symbol('tweakable:propertyMetadata');

export type TweakableConfig =
    | 'boolean'
    | 'number'
    | 'string'
    | 'shipId'
    | 'vec2'
    | {
          type: 'enum';
          enum: {
              [name: string | number]: string | number;
          };
      }
    | {
          type: 'string enum';
          enum: readonly string[];
      }
    | {
          type: 'number';
          number?: {
              min?: number;
              max?: number;
          };
      };
export type TweakableMetadata =
    TweakableValue | { config: (target: Schema) => TweakableConfig; field: string } | undefined;
export type TweakableValue = { config: TweakableConfig; field: string };

function isTweakableValue(data: TweakableMetadata): data is TweakableValue {
    return !!(data && typeof data.config !== 'function');
}
export function tweakable<T extends Schema>(config: TweakableConfig | ((target: T) => TweakableConfig)) {
    return (target: T, propertyKey: string | symbol) => {
        Reflect.defineMetadata(tweakablePropertyMetadataKey, { config, field: propertyKey }, target, propertyKey);
    };
}

/**
 * Returns true if `field` was annotated with `@tweakable(...)` on `instance`'s
 * class (or any ancestor class). Used by `isCommandable` in `game-field.ts`
 * to implicitly admit every `@tweakable` field to the JSON Pointer command
 * surface, because the GM tweak panel (`modules/browser/src/widgets/tweak.ts`)
 * enumerates those fields and wires them directly to `readWriteProp`.
 *
 * See `docs/json-ptr.md`.
 */
export function hasTweakableMetadata(instance: object, field: string): boolean {
    return Reflect.getMetadata(tweakablePropertyMetadataKey, instance, field) != null;
}

export function getTweakables(state: Schema) {
    const tweakables: TweakableValue[] = [];
    for (const field of Object.keys(state)) {
        const data = Reflect.getMetadata(tweakablePropertyMetadataKey, state, field) as TweakableMetadata;
        if (data) {
            if (isTweakableValue(data)) {
                tweakables.push(data);
            } else {
                tweakables.push({ ...data, config: data.config(state) });
            }
        }
    }
    return tweakables;
}
