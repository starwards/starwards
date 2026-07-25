import {
    EPSILON,
    calcArcAngle,
    limitPercisionHard,
    toPositiveDegreesDelta,
    toStrictPositiveDegreesDelta,
} from './formulas';

import { Circle } from 'detect-collisions';
import { SpaceObject } from '../space';
import { SpatialIndex } from './space-manager';
import { XY } from './xy';

/**
 * Radar detection threshold factor. Minimum detectable radius = factor × √distance.
 * Based on radar equation: RCS ∝ radius², signal ∝ 1/distance⁴.
 * With 0.025: shells (r=1) detectable to ~1600m, asteroids (r=50+) always visible.
 */
const MIN_RADAR_DETECT_FACTOR = 0.025;

type VisibleObject = {
    object: SpaceObject | null;
    distance: number;
};
type VisibleArc = VisibleObject & {
    fromAngle: number;
    toAngle: number;
};
type CoverageInterval = {
    from: number;
    to: number;
    range: number;
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
        public object: SpaceObject,
    ) {}

    get view() {
        if (this.isDirty) {
            this.isDirty = false;
            const intervals = this.coverageIntervals();
            const sortedEndPoints = [...this.visibilityEndpoints(intervals)].sort((a, b) => a.angle - b.angle);
            this.archs = [...this.visibleArcs(sortedEndPoints, intervals)];
        }
        return this.archs;
    }

    setDirty() {
        this.isDirty = true;
    }

    private get maxRange(): number {
        return this.object.radarRange;
    }

    /**
     * The object's radar sectors, flattened into disjoint angular intervals over [0, 360), each
     * carrying the longest reach among the sectors that cover it.
     *
     * Overlapping sectors cannot be fed to the sweep as-is: the sweep keeps the *closest* entry, so
     * overlapping free-space markers would collapse an overlap to its shortest range — the opposite
     * of a union. Splitting into disjoint intervals first makes the union fall out of the existing
     * closest-wins sweep unchanged.
     */
    private coverageIntervals(): CoverageInterval[] {
        const boundaries = new Set([0, 360]);
        const wedges: CoverageInterval[] = [];
        for (const sector of this.object.radarSectors) {
            if (sector.range <= EPSILON || sector.arc <= EPSILON) {
                continue;
            }
            if (sector.arc >= 360) {
                wedges.push({ from: 0, to: 360, range: sector.range });
                continue;
            }
            const from = toPositiveDegreesDelta(sector.direction - sector.arc / 2);
            const to = from + sector.arc;
            // a wedge crossing 0 degrees becomes two, so every wedge stays within [0, 360)
            if (to > 360) {
                wedges.push({ from, to: 360, range: sector.range }, { from: 0, to: to - 360, range: sector.range });
                boundaries.add(from).add(to - 360);
            } else {
                wedges.push({ from, to, range: sector.range });
                boundaries.add(from).add(to);
            }
        }
        const sorted = [...boundaries].sort((a, b) => a - b);
        const intervals: CoverageInterval[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            const from = sorted[i];
            const to = sorted[i + 1];
            if (to - from < EPSILON) {
                continue;
            }
            const midAngle = (from + to) / 2;
            let range = 0;
            for (const wedge of wedges) {
                if (wedge.from <= midAngle && midAngle < wedge.to && wedge.range > range) {
                    range = wedge.range;
                }
            }
            const previous = intervals.at(-1);
            if (previous && previous.range === range) {
                previous.to = to;
            } else {
                intervals.push({ from, to, range });
            }
        }
        return intervals;
    }

    private rangeAtBearing(intervals: CoverageInterval[], bearing: number): number {
        const angle = toPositiveDegreesDelta(bearing);
        for (const interval of intervals) {
            if (interval.from <= angle && angle < interval.to) {
                return interval.range;
            }
        }
        return 0;
    }

    private *visibleArcs(sortedEndPoints: Array<EndPoint>, intervals: CoverageInterval[]): Generator<VisibleArc> {
        // One free-space marker per coverage interval, at that interval's reach. It doubles as the
        // "nothing blocks the view" artifact and as the range cutoff: an object farther than the
        // interval's reach loses to the marker in the closest-wins sweep and stays invisible.
        // Bearings no sector covers get a marker at distance 0, which shadows everything — blind.
        // The intervals tile [0, 360) with no gaps, so the sweep always has a marker in hand.
        for (const interval of intervals) {
            const marker: VisibleObject = { object: null, distance: interval.range };
            sortedEndPoints.push(
                { visible: marker, angle: interval.from, type: 'start' },
                { visible: marker, angle: interval.to, type: 'stop' },
            );
        }
        // at a shared boundary the next interval must open before the previous one closes
        sortedEndPoints.sort((a, b) => a.angle - b.angle || (a.type === 'start' ? -1 : 1));
        const currObjsByDistance: VisibleObject[] = []; // objects the sweep line intersects (at current angle), sorted by distance
        // sentinel: matches nothing, so the first real marker starts the first arc at angle 0
        let closestObj = { visible: { object: null, distance: -1 } as VisibleObject, fromAngle: 0 };
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
                        distance: closestObj.visible.distance,
                        fromAngle: closestObj.fromAngle,
                        toAngle: ep.angle,
                    };
                }
                closestObj = { visible: currObjsByDistance[0], fromAngle: ep.angle };
            }
        }
    }

    private *visibilityEndpoints(intervals: CoverageInterval[]): Generator<EndPoint> {
        // assumption: objects don't overlap
        const maxRange = this.maxRange;
        if (maxRange > EPSILON) {
            const queryArea = new Circle(XY.clone(this.object.position), maxRange + EPSILON);
            for (const object of this.objects.selectPotentials(queryArea)) {
                if (this.object !== object && object.isCorporal) {
                    const posDiff = XY.difference(object.position, this.object.position);
                    const distance = XY.lengthOf(posDiff);
                    const centerAngle = XY.angleOf(posDiff);
                    const inSector = distance <= this.rangeAtBearing(intervals, centerAngle) + object.radius;
                    if (object.radius > MIN_RADAR_DETECT_FACTOR * Math.sqrt(distance) && inSector) {
                        const arcAngle = calcArcAngle(object.radius * 2, distance);
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
