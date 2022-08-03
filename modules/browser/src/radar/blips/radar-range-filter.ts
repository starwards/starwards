import {
    EPSILON,
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
type VisibleArc = {
    object: SpaceObject | null;
    distance: number;
    fromAngle: number;
    toAngle: number;
};
type EndPoint = {
    angle: number;
    visible: VisibleArc;
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
        const radarRangeArc = {
            object: null,
            distance: Number.MAX_VALUE,
            fromAngle: 0,
            toAngle: 360,
        };
        const open: VisibleArc[] = [radarRangeArc]; // list of objects the sweep line intersects (at current angle)
        let nearestStart: EndPoint = { visible: radarRangeArc, angle: 0, type: 'start' };
        sortedEndPoints.push({ visible: radarRangeArc, angle: 360, type: 'stop' });
        // sweep from angle 0 to 360
        // put in this.view objects that are nearest to the sweep line across the entire sweep
        for (const ep of sortedEndPoints) {
            if (ep.type === 'start') {
                open.push(ep.visible);
                open.sort((a, b) => a.distance - b.distance);
            } else {
                // ep.type === 'stop'
                if (!nearestStart || open.indexOf(ep.visible) === -1) {
                    // eslint-disable-next-line no-console
                    console.error('debug', { ep, nearestStart, open, sortedEndPoints });
                    throw new Error('obstacle stop with no start?');
                }
                open.splice(open.indexOf(ep.visible), 1);
            }
            if (nearestStart.visible !== open[0]) {
                if (nearestStart.angle < ep.angle) {
                    // record previous nearest obstacle before starting new obstacle
                    yield {
                        object: nearestStart.visible.object,
                        distance: Math.min(nearestStart.visible.distance, this.object.radarRange),
                        fromAngle: nearestStart.angle,
                        toAngle: ep.angle,
                    };
                }
                nearestStart = { visible: open[0], angle: ep.angle, type: 'start' };
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
                        const visible = {
                            object,
                            distance,
                            fromAngle: limitPercisionHard(toPositiveDegreesDelta(centerAngle - arcAngle / 2)),
                            toAngle: limitPercisionHard(toStrictPositiveDegreesDelta(centerAngle + arcAngle / 2)),
                        };
                        if (visible.fromAngle < visible.toAngle) {
                            yield { visible, angle: visible.fromAngle, type: 'start' };
                            yield { visible, angle: visible.toAngle, type: 'stop' };
                        } else {
                            yield { visible, angle: visible.fromAngle, type: 'start' };
                            yield { visible, angle: 360, type: 'stop' };
                            yield { visible, angle: 0, type: 'start' };
                            yield { visible, angle: visible.toAngle, type: 'stop' };
                        }
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
