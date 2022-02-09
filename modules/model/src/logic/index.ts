import { SpaceObject, SpaceState, Spaceship } from '../space';

export function getTarget(ship: Spaceship, space: SpaceState): SpaceObject | null {
    return (ship.targetId && space.get(ship.targetId)) || null;
}

export * from './bot';
export * from './formulas';
export * from './gunner-assist';
export * from './helm-assist';
export * from './space-manager';
export * from './states-toggle';
export * from './xy';
export * from './xyz';
