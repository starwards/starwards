import { SpaceObject, Spaceship } from '../space';

import { Circle } from 'detect-collisions';
import { Iterator } from './iteration';
import { ShipState } from '../ship';
import { SpatialIndex } from './space-manager';
import { XY } from './xy';
import { shipConfigurations } from '../configurations';

const MIN_RADIUS_DOCKING_TARGET = 1;

function isLegalDockingTarget(ship: ShipState, o: SpaceObject): boolean {
    return (
        ship.id !== o.id &&
        o.isCorporal &&
        o.radius > MIN_RADIUS_DOCKING_TARGET &&
        Spaceship.isInstance(o) &&
        o.faction === ship.faction &&
        !!o.model &&
        shipConfigurations[o.model].docking.isDockingHost
    );
}

export function getClosestDockingTarget(ship: ShipState, spatial: SpatialIndex) {
    const queryArea = new Circle(XY.clone(ship.position), ship.docking.design.maxDockingDistance + ship.radius);
    const res =
        [
            ...new Iterator(spatial.selectPotentials(queryArea))
                .filter((o) => isLegalDockingTarget(ship, o))
                .map<[string, number]>((o) => {
                    const diff = XY.difference(o.position, ship.position);
                    const distance = XY.lengthOf(diff) - o.radius - ship.radius;
                    return [o.id, distance];
                })
                .filter(([_, distance]) => distance < ship.docking.design.maxDockingDistance),
        ].sort(([, a], [, b]) => a - b)[0]?.[0] || null;
    return res;
}
