import * as _shipProperties from './ship-properties';

import { ChainGun } from './chain-gun';
import { Thruster } from './thruster';

export interface ShipSystems {
    ChainGun: ChainGun;
    Thruster: Thruster;
}
export * from './armor';
export * from './ship-state';
export * from './chain-gun';
export * from './ship-manager';
export * from './ship-direction';
export * from './ship-areas';

export const shipProperties = _shipProperties;
