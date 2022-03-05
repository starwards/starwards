import { XY } from './xy';

export const MAX_SAFE_FLOAT = Math.pow(2, 39);
/**
 * normalize drgrees to value between (-180, 180]
 */
export function toDegreesDelta(degrees: number) {
    const deg = degrees % 360;
    if (deg <= -180) {
        return deg + 360;
    } else if (deg > 180) {
        return deg - 360;
    } else {
        return deg;
    }
}

export function lerp(fromRange: [number, number], toRange: [number, number], fromValue: number) {
    const t = (fromValue - fromRange[0]) / (fromRange[1] - fromRange[0]);
    return (1 - t) * toRange[0] + t * toRange[1];
}

export function snapToRange(from: number, to: number, medianRange: number, value: number) {
    const median = from - to;
    return value > median + medianRange ? to : value < median - medianRange ? from : median;
}
export function capToRange(from: number, to: number, value: number) {
    return value > to ? to : value < from ? from : value;
}
export function isInRange(from: number, to: number, value: number) {
    return value < to && value > from;
}
/**
 *  generate a random number with a given mean and standard deviation
 */
export function gaussianRandom(mean: number, stdev: number): number {
    return mean + 2.0 * stdev * (Math.random() + Math.random() + Math.random() - 1.5);
}

/**
 * The method calculates the two intersection points between circles with given centres and given radii.
 * It returns the points in the order that the arc for circle0 is from the first to the second returned point.
 * The arc for circle1 is from the second to the first intersection point
 */
export function circlesIntersection(centre0: XY, centre1: XY, r0: number, r1: number): [XY, XY] | undefined {
    const dx = centre1.x - centre0.x;
    const dy = centre1.y - centre0.y;

    const distance = Math.sqrt(dy * dy + dx * dx);

    // check whether the cirles do not intersect of one is completely confined within another
    if (distance > r0 + r1 || distance < Math.abs(r0 - r1)) {
        // eslint-disable-next-line no-console
        console.log(
            `no intersection distance: ${distance}, (x0, y0): ${centre0.x}, ${centre0.y}, r0 = ${r0}, (x1, y1): ${centre1.x}, ${centre1.y}, r1 = ${r1}`
        );
        return undefined;
    }

    /**
     * point2 is the intersection between the chord between the intersection points
     * and a line that passes through both circle centres.
     */
    const a = (r0 * r0 - r1 * r1 + distance * distance) / (2.0 * distance);
    const p2 = { x: centre0.x + (dx * a) / distance, y: centre0.y + (dy * a) / distance };

    // h is the distance from p2 and either of the circle intersection points
    const h = Math.sqrt(r0 * r0 - a * a);

    // ox and oy are the offsets of the intersection points from p2
    const ox = -dy * (h / distance);
    const oy = dx * (h / distance);

    // i0 and i1 are the intersection points
    const i0 = { x: p2.x + ox, y: p2.y + oy };
    const i1 = { x: p2.x - ox, y: p2.y - oy };

    if (
        (centre1.x > centre0.x && i0.y > i1.y) ||
        (centre0.x > centre1.x && i1.y > i0.y) ||
        (centre0.x === centre1.x && ((centre1.y > centre0.y && i1.x > i0.x) || (centre0.y > centre1.y && i0.x > i1.x)))
    ) {
        return [i1, i0];
    }

    return [i0, i1];
}

export function addScale(orig: XY, deriv: XY, time: number) {
    return XY.add(orig, XY.scale(deriv, time));
}

// x(t)=x0+v0t+(at^2)/2
export function equasionOfMotion(x0: number, v0: number, a: number, t: number) {
    return x0 + v0 * t + (a / 2) * t * t;
}

export function timeToReachDistanceByAccelerationWithMaxSpeed(x: number, a: number, mv: number) {
    const noMaxTime = timeToReachDistanceByAcceleration(x, a);
    const speedupTime = timeToReachVelocityByAcceleration(mv, a);
    if (noMaxTime < speedupTime) {
        return noMaxTime;
    }
    const distanceInSpeedup = equasionOfMotion(0, 0, a, speedupTime);
    return speedupTime + (x - distanceInSpeedup) / mv;
}
export function timeToReachDistanceByAcceleration(x: number, a: number) {
    return 2 * Math.sqrt(x / a);
}
export function timeToReachVelocityByAcceleration(v: number, a: number) {
    return v / a;
}

export function whenWillItStop(v0: number, a: number) {
    if (v0 === 0) {
        return 0;
    } else if (a === 0 || sign(v0) === sign(a)) {
        return Infinity;
    } else {
        return Math.abs(v0 / a);
    }
}

export function whereWillItStop(x0: number, v0: number, a: number) {
    return equasionOfMotion(x0, v0, a, whenWillItStop(v0, a));
}

export function limitPercision(num: number) {
    return Math.round(num * 1e4) / 1e4;
}

export function limitPercisionHard(num: number) {
    return Math.round(num * 1e2) / 1e2;
}

export type Sign = 1 | -1 | 0;
export function sign(x: number): Sign {
    return typeof x === 'number' && x ? (x < 0 ? -1 : 1) : 0;
}

export function negSign(x: number): Sign {
    return typeof x === 'number' && x ? (x < 0 ? 1 : -1) : 0;
}

export function safeDiv(a: number, b: number) {
    return a === b ? 1 : b == 0 ? Number.POSITIVE_INFINITY * sign(a) : a / b;
}

export const degToRad = Math.PI / 180;
