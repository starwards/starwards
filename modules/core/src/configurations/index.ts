import { dragonflySF22 } from './dragonfly-sf-22';
import { getKeys } from '../utils';

export * from './dragonfly-sf-22';

export const shipConfigurations = {
    'dragonfly-SF22': dragonflySF22,
};
export type ShipModel = keyof typeof shipConfigurations;
export const shipModels = getKeys(shipConfigurations);
