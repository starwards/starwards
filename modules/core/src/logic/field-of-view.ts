import {
    EPSILON,
    MAX_SAFE_FLOAT,
    calcArcAngle,
    limitPercisionHard,
    toPositiveDegreesDelta,
    toStrictPositiveDegreesDelta,
} from './formulas';

import { Circle } from 'detect-collisions';
import { SpaceObject } from '../space';
import { SpatialIndex } from './space-manager';
import { XY } from './xy';

const MIN_RADIUS_RADAR_BLOCK = 1;

type VisibleObject = {
    object: SpaceObject | null;
    distance: number;
};
type VisibleArc = VisibleObject & {
    fromAngle: number;
    toAngle: number;
};
type EndPoint = {
    angle: number;
    visible: VisibleObject;
    type: 'start' | 'stop';
};
export class FieldOfView {
    private archs: VisibleArc[] = [];
    private isDirty = true;
    constructor(private objects: SpatialIndex, public object: SpaceObject) {}

    get view() {
        if (this.isDirty) {
            this.isDirty = false;
            const sortedEndPoints = [...this.visibilityEndpoints()].sort((a, b) => a.angle - b.angle);
            this.archs = [...this.visibleArcs(sortedEndPoints)];
        }
        return this.archs;
    }

    setDirty() {
        this.isDirty = true;
    }

    private *visibleArcs(sortedEndPoints: Array<EndPoint>): Generator<VisibleArc> {
        // to avoid checking for empty data structures, we place a fake null object at the maximum distance at 360 degrees.
        // This serves as a marker for "nothing blocks the view"
        const dummyObject: VisibleObject = { object: null, distance: MAX_SAFE_FLOAT };
        const currObjsByDistance = [dummyObject]; // list of objects the sweep line intersects (at current angle), sorted by distance
        let closestObj = { visible: dummyObject, fromAngle: 0 }; // the closest object and the angle in which we started seeing it
        sortedEndPoints.push({ visible: dummyObject, angle: 360, type: 'stop' });
        // sweep from angle 0 to 360
        // put in this.view objects that are nearest to the sweep line across the entire sweep
        for (const ep of sortedEndPoints) {
            if (ep.type === 'start') {
                // add a visible object and re-order by distance
                currObjsByDistance.push(ep.visible);
                currObjsByDistance.sort((a, b) => a.distance - b.distance);
            } else {
                // ep.type === 'stop'
                currObjsByDistance.splice(currObjsByDistance.indexOf(ep.visible), 1); // remove a visible object
            }
            if (closestObj.visible !== currObjsByDistance[0]) {
                if (closestObj.fromAngle < ep.angle) {
                    // record previous nearest obstacle before starting new obstacle
                    yield {
                        object: closestObj.visible.object,
                        distance: Math.min(closestObj.visible.distance, this.object.radarRange),
                        fromAngle: closestObj.fromAngle,
                        toAngle: ep.angle,
                    };
                }
                closestObj = { visible: currObjsByDistance[0], fromAngle: ep.angle };
            }
        }
    }

    private *visibilityEndpoints(): Generator<EndPoint> {
        // assumption: objects don't overlap
        if (this.object.radarRange > EPSILON) {
            const queryArea = new Circle(XY.clone(this.object.position), this.object.radarRange + EPSILON);
            for (const object of this.objects.selectPotentials(queryArea)) {
                if (this.object !== object && object.isCorporal && object.radius > MIN_RADIUS_RADAR_BLOCK) {
                    const posDiff = XY.difference(object.position, this.object.position);
                    const distance = XY.lengthOf(posDiff);
                    if (distance <= this.object.radarRange + object.radius) {
                        const arcAngle = calcArcAngle(object.radius * 2, distance);
                        const centerAngle = XY.angleOf(posDiff);
                        // in radar range
                        const visible = { object, distance };
                        const fromAngle = limitPercisionHard(toPositiveDegreesDelta(centerAngle - arcAngle / 2));
                        const toAngle = limitPercisionHard(toStrictPositiveDegreesDelta(centerAngle + arcAngle / 2));
                        yield { visible, angle: fromAngle, type: 'start' };
                        if (fromAngle > toAngle) {
                            yield { visible, angle: 360, type: 'stop' };
                            yield { visible, angle: 0, type: 'start' };
                        }
                        yield { visible, angle: toAngle, type: 'stop' };
                    }
                }
            }
        }
    }
}
