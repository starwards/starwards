import { EPSILON, RTuple2, Tuple2, archIntersection } from '../logic/formulas';

export enum ShipArea {
    front,
    rear,
    SHIP_AREAS_COUNT,
}

export const FRONT_ARC: RTuple2 = [-90, 90 - EPSILON];
export const REAR_ARC: RTuple2 = [90, -90 - EPSILON];

export function* shipAreasInRange(localAngleRange: RTuple2) {
    if (archIntersection(FRONT_ARC, localAngleRange)) {
        yield ShipArea.front;
    }
    if (archIntersection(REAR_ARC, localAngleRange)) {
        yield ShipArea.rear;
    }
}
