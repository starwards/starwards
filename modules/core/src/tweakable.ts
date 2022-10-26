import 'reflect-metadata';

import { Schema } from '@colyseus/schema';

const tweakablePropertyMetadataKey = Symbol('tweakable:propertyMetadata');

export type TweakableConfig =
    | 'number'
    | {
          enum: {
              [name: string | number]: string | number;
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
