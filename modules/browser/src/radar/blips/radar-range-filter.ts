import {
    EPSILON,
    MAX_SAFE_FLOAT,
    SpaceDriver,
    SpaceObject,
    SpatialIndex,
    TrackObjects,
    XY,
    calcArcAngle,
    degToRad,
    limitPercisionHard,
    toPositiveDegreesDelta,
    toStrictPositiveDegreesDelta,
} from '@starwards/model';

import { CameraView } from '../camera-view';
import { Circle } from 'detect-collisions';
import { Graphics } from 'pixi.js';
import { noop } from 'ts-essentials';

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
class FieldOfView {
    view: VisibleArc[] = [];
    constructor(private objects: SpatialIndex, public object: SpaceObject) {
        this.update();
    }

    update() {
        const sortedEndPoints = [...this.visibilityEndpoints()].sort((a, b) => a.angle - b.angle);
        this.view = [...this.visibleArcs(sortedEndPoints)];
    }

    draw(parent: CameraView, fovGraphics: Graphics) {
        const objectScreenPos = parent.worldToScreen(this.object.position);
        const lastArc = this.view[this.view.length - 1];
        const lastArcEnd = parent.worldToScreen(
            XY.add(this.object.position, XY.byLengthAndDirection(lastArc.distance, lastArc.toAngle))
        );
        fovGraphics.moveTo(lastArcEnd.x, lastArcEnd.y);
        for (const visibleArc of this.view) {
            const arcStart = parent.worldToScreen(
                XY.add(this.object.position, XY.byLengthAndDirection(visibleArc.distance, visibleArc.fromAngle))
            );
            fovGraphics.lineTo(arcStart.x, arcStart.y);
            fovGraphics.arc(
                objectScreenPos.x,
                objectScreenPos.y,
                parent.metersToPixles(visibleArc.distance),
                degToRad * (visibleArc.fromAngle - parent.camera.angle),
                degToRad * (visibleArc.toAngle - parent.camera.angle)
            );
        }
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
                if (this.object !== object && object.radius > MIN_RADIUS_RADAR_BLOCK) {
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
export class RadarRangeFilter {
    public visibleObjects = new Set<SpaceObject>();

    private createFieldOfView = (o: SpaceObject) => new FieldOfView(this.spaceDriver.spatial, o);
    private updateFieldOfView = (_: SpaceObject, r: FieldOfView) => r.update();
    private fovs = new TrackObjects<FieldOfView>(
        this.spaceDriver,
        this.createFieldOfView,
        this.updateFieldOfView,
        noop,
        this.shouldTrackFov
    );
    constructor(private spaceDriver: SpaceDriver, private shouldTrackFov?: (o: SpaceObject) => boolean) {}

    public update = () => {
        this.visibleObjects.clear();
        this.fovs.update();
        for (const fov of this.fieldsOfView()) {
            this.visibleObjects.add(fov.object);
            for (const visibleArc of fov.view) {
                visibleArc.object && this.visibleObjects.add(visibleArc.object);
            }
        }
    };

    public fieldsOfView() {
        return this.fovs.values();
    }

    public isInRange = (obj: SpaceObject) => {
        return this.visibleObjects.has(obj);
    };
}
