import { ShipState } from './ship';
import { SpaceObject, SpaceState } from './space';

export function getTargetObject(space: SpaceState, ship: ShipState): SpaceObject | undefined {
    return ship.targetId ? space.get(ship.targetId) : undefined;
}
