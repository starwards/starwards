import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

const tweakablePropertyMetadataKey = Symbol('tweakable:propertyMetadata');

export type TweakableConfig =
    | 'boolean'
    | 'number'
    | 'string'
    | 'shipId'
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
    | TweakableValue
    | { config: (target: Schema) => TweakableConfig; field: string }
    | undefined;
export type TweakableValue = { config: TweakableConfig; field: string };

function isTweakableValue(data: TweakableMetadata): data is TweakableValue {
    return !!(data && typeof data.config !== 'function');
}
export function tweakable<T extends Schema>(config: TweakableConfig | ((target: T) => TweakableConfig)) {
    return (target: T, propertyKey: string | symbol) => {
        Reflect.defineMetadata(tweakablePropertyMetadataKey, { config, field: propertyKey }, target, propertyKey);
    };
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
