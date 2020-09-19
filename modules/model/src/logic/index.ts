import { SpaceObject, Spaceship, SpaceState } from '../space';

export function getTarget(ship: Spaceship, space: SpaceState): SpaceObject | null {
    return (ship.targetId && space.get(ship.targetId)) || null;
}

export * from './xy';
export * from './formulas';
export * from './helm-assist';
export * from './gunner-assist';
export * from './space-manager';
export * from './ship-manager';
