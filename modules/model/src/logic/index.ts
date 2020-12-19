import * as _adminProperties from './admin-properties';
import * as _shipProperties from './ship-properties';
import * as _spaceProperties from './space-properties';

import { SpaceObject, SpaceState, Spaceship } from '../space';

export function getTarget(ship: Spaceship, space: SpaceState): SpaceObject | null {
    return (ship.targetId && space.get(ship.targetId)) || null;
}

export * from './xy';
export * from './formulas';
export * from './helm-assist';
export * from './gunner-assist';
export * from './space-manager';
export * from './ship-manager';
export * from './bot';
export * from './states-toggle';
export const shipProperties = _shipProperties;
export const adminProperties = _adminProperties;
export const spaceProperties = _spaceProperties;
