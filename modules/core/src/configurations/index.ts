import { cataphract } from './cataphract';
import { chaingunPlatform } from './chaingun-platform';
import { dragonflyMK1 } from './dragonfly-mk1';
import { dragonflyMK2 } from './dragonfly-mk2';
import { dragonflySF22 } from './dragonfly-sf-22';
import { freighter } from './freighter';
import { getKeys } from '../utils';
import { glaive } from './glaive';
import { gravitas } from './gravitas';
import { largeStation } from './large-station';
import { predator } from './predator';
import { smallStation } from './small-station';

export * from './armor-models';
export * from './dragonfly-sf-22';
export * from './dragonfly-mk1';
export * from './dragonfly-mk2';
export * from './gravitas';
export * from './predator';
export * from './glaive';
export * from './cataphract';
export * from './freighter';
export * from './small-station';
export * from './chaingun-platform';
export * from './large-station';
export * from './repair-protocols';

export const shipConfigurations = {
    'dragonfly-SF22': dragonflySF22,
    'dragonfly-MK1': dragonflyMK1,
    'dragonfly-MK2': dragonflyMK2,
    gravitas,
    predator,
    glaive,
    cataphract,
    freighter,
    'small-station': smallStation,
    'chaingun-platform': chaingunPlatform,
    'large-station': largeStation,
};
export type ShipModel = keyof typeof shipConfigurations;
export const shipModels = getKeys(shipConfigurations);
