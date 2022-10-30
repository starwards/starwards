import { dragonflySF22 } from './dragonfly-sf-22';

export * from './dragonfly-sf-22';
export * from './projectiles';

export const shipConfigurations = {
    'dragonfly-SF22': dragonflySF22,
};
export type ShipModel = keyof typeof shipConfigurations;
