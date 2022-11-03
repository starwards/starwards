import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

const tweakablePropertyMetadataKey = Symbol('tweakable:propertyMetadata');

export type TweakableConfig =
    | 'boolean'
    | 'number'
    | 'string'
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
export type TweakableValue = { config: TweakableConfig; field: string };

export function tweakable(config: TweakableConfig) {
    return (target: Schema, propertyKey: string | symbol) => {
        Reflect.defineMetadata(tweakablePropertyMetadataKey, { config, field: propertyKey }, target, propertyKey);
    };
}

export function getTweakables(state: Schema) {
    const tweakables: TweakableValue[] = [];
    for (const field of Object.keys(state)) {
        const config = Reflect.getMetadata(tweakablePropertyMetadataKey, state, field) as TweakableValue | undefined;
        if (config) {
            tweakables.push(config);
        }
    }
    return tweakables;
}
