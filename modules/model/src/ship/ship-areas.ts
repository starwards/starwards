import { EPSILON, archIntersection } from '../logic/formulas';

export enum ShipArea {
    front,
    rear,
    SHIP_AREAS_COUNT,
}

export const FRONT_ARC: [number, number] = [-90, 90 - EPSILON];
export const REAR_ARC: [number, number] = [90, -90 - EPSILON];

export function* shipAreasInRange(localAngleRange: readonly [number, number]) {
    if (archIntersection(FRONT_ARC, localAngleRange)) {
        yield ShipArea.front;
    }
    if (archIntersection(REAR_ARC, localAngleRange)) {
        yield ShipArea.rear;
    }
}
