import {
    EPSILON,
    calcArcAngle,
    limitPercisionHard,
    toPositiveDegreesDelta,
    toStrictPositiveDegreesDelta,
} from './formulas';

import { Circle } from 'detect-collisions';
import { DeepReadonly } from 'ts-essentials';
import { SpaceObject } from '../space';
import { SpatialIndex } from './space-manager';
import { XY } from './xy';

/**
 * Radar detection threshold factor. Minimum detectable radius = factor × √distance.
 * Based on radar equation: RCS ∝ radius², signal ∝ 1/distance⁴.
 * With 0.025: shells (r=1) detectable to ~1600m, asteroids (r=50+) always visible.
 * Exported so hull-radius validation (`ship/make-ship-state.ts`) can derive the same
 * detectability floor instead of duplicating the constant.
 */
export const MIN_RADAR_DETECT_FACTOR = 0.025;

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
    constructor(
        private objects: SpatialIndex,
        public object: DeepReadonly<SpaceObject>,
    ) {}

    get view() {
        if (this.isDirty) {
            this.isDirty = false;
            this.archs = [...this.visibleArcs([...this.visibilityEndpoints()])];
        }
        return this.archs;
    }

    setDirty() {
        this.isDirty = true;
    }

    private *validSectors() {
        for (const sector of this.object.radarSectors) {
            if (sector.range > EPSILON && sector.arc > EPSILON) {
                yield sector;
            }
        }
    }

    /**
     * The widest reach across all sectors, regardless of bearing. Only good for bounding the
     * broadphase query — every candidate it returns still has to pass `rangeAtBearing`.
     */
    private maxSectorRange(): number {
        let max = 0;
        for (const sector of this.validSectors()) {
            if (sector.range > max) {
                max = sector.range;
            }
        }
        return max;
    }

    /**
     * How far the radar reaches at a bearing: the longest range among the sectors covering it,
     * 0 when none does.
     */
    private rangeAtBearing(bearing: number): number {
        let range = 0;
        for (const sector of this.validSectors()) {
            const covered =
                sector.arc >= 360 || toPositiveDegreesDelta(bearing - (sector.direction - sector.arc / 2)) < sector.arc;
            if (covered && sector.range > range) {
                range = sector.range;
            }
        }
        return range;
    }

    /**
     * Free-space marker endpoints, one marker per sector at that sector's reach. In the sweep the
     * longest active marker sets the effective range: it is both the "nothing blocks the view"
     * artifact and the range cutoff for objects at that bearing.
     */
    private *sectorEndpoints(): Generator<EndPoint> {
        for (const sector of this.validSectors()) {
            if (sector.arc >= 360) {
                const marker: VisibleObject = { object: null, distance: sector.range };
                yield { visible: marker, angle: 0, type: 'start' };
                yield { visible: marker, angle: 360, type: 'stop' };
                continue;
            }
            const from = toPositiveDegreesDelta(sector.direction - sector.arc / 2);
            const to = from + sector.arc;
            // a sector crossing 0 degrees becomes two markers, so removal by identity stays valid
            if (to > 360) {
                const head: VisibleObject = { object: null, distance: sector.range };
                const tail: VisibleObject = { object: null, distance: sector.range };
                yield { visible: head, angle: from, type: 'start' };
                yield { visible: head, angle: 360, type: 'stop' };
                yield { visible: tail, angle: 0, type: 'start' };
                yield { visible: tail, angle: to - 360, type: 'stop' };
            } else {
                const marker: VisibleObject = { object: null, distance: sector.range };
                yield { visible: marker, angle: from, type: 'start' };
                yield { visible: marker, angle: to, type: 'stop' };
            }
        }
    }

    private *visibleArcs(endPoints: Array<EndPoint>): Generator<VisibleArc> {
        endPoints.push(...this.sectorEndpoints());
        // at a shared boundary the next sector/object must open before the previous one closes
        endPoints.sort((a, b) => a.angle - b.angle || (a.type === b.type ? 0 : a.type === 'start' ? -1 : 1));
        const activeMarkers: VisibleObject[] = []; // sector markers covering the current bearing
        const currObjsByDistance: VisibleObject[] = []; // objects the sweep line intersects (at current angle), sorted by distance
        // bearings no sector covers are blind: free space at distance 0, which shadows everything
        let current: VisibleArc = { object: null, distance: 0, fromAngle: 0, toAngle: 0 };
        // sweep from angle 0 to 360
        // put in this.view objects that are nearest to the sweep line across the entire sweep
        for (const ep of endPoints) {
            if (ep.visible.object === null) {
                if (ep.type === 'start') {
                    activeMarkers.push(ep.visible);
                } else {
                    activeMarkers.splice(activeMarkers.indexOf(ep.visible), 1);
                }
            } else if (ep.type === 'start') {
                currObjsByDistance.push(ep.visible);
                currObjsByDistance.sort((a, b) => a.distance - b.distance);
            } else {
                // ep.type === 'stop'
                currObjsByDistance.splice(currObjsByDistance.indexOf(ep.visible), 1);
            }
            // the longest active marker wins over the others: overlapping sectors union their reach.
            // On a distance tie the closest object beats free space, so an object capped at exactly
            // the sector range shows.
            const effectiveRange = activeMarkers.reduce((max, marker) => Math.max(max, marker.distance), 0);
            const closest = currObjsByDistance[0];
            const visible: VisibleObject =
                closest && closest.distance <= effectiveRange ? closest : { object: null, distance: effectiveRange };
            if (visible.object !== current.object || visible.distance !== current.distance) {
                if (current.fromAngle < ep.angle) {
                    // record previous visible before starting a new arc
                    current.toAngle = ep.angle;
                    yield current;
                }
                current = { object: visible.object, distance: visible.distance, fromAngle: ep.angle, toAngle: 0 };
            }
        }
        if (current.fromAngle < 360) {
            current.toAngle = 360;
            yield current;
        }
    }

    private *visibilityEndpoints(): Generator<EndPoint> {
        // assumption: objects don't overlap
        const maxRange = this.maxSectorRange();
        if (maxRange > EPSILON) {
            const queryArea = new Circle(XY.clone(this.object.position), maxRange + EPSILON);
            for (const object of this.objects.selectPotentials(queryArea)) {
                if (this.object !== object && object.isCorporal) {
                    const posDiff = XY.difference(object.position, this.object.position);
                    const distance = XY.lengthOf(posDiff);
                    const centerAngle = XY.angleOf(posDiff);
                    // approximation: the sector gate samples only the object's center bearing, so an
                    // object straddling a sector edge is all-or-nothing by where its center falls
                    const rangeAtCenter = this.rangeAtBearing(centerAngle);
                    const inSector = distance <= rangeAtCenter + object.radius;
                    if (object.radius > MIN_RADAR_DETECT_FACTOR * Math.sqrt(distance) && inSector) {
                        const arcAngle = calcArcAngle(object.radius * 2, distance);
                        // cap at the sector range: an object poking its edge past the range shows at
                        // the range itself, and the tie against free space goes to it
                        const visible = { object, distance: Math.min(distance, rangeAtCenter) };
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
