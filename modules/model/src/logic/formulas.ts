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

// generanes a random number with normal distribution using the Marsaglia polar method
export function normalMarsagliaRandomPair(mean = 0.0, stdev = 1.0): [number, number] {
    let u, v, s: number;
    do {
        u = Math.random();
        v = Math.random();
        s = u * u + v * v;
    } while (s === 0 || s >= 1);

    s = Math.sqrt((-2.0 * Math.log(s)) / s);

    return [mean + stdev * u * s, mean + stdev * v * s];
}

// returns the first number of the generated pair
export function normalMarsagliaRandom(mean = 0.0, stdev = 1.0): number {
    return normalMarsagliaRandomPair(mean, stdev)[0];
}

/**
 * generates a random number with a skew normal distribution.
 * location correlates to mean, scale correlates to standard deviation and shape is the parameter for skewness.
 * for further information start here: https://en.wikipedia.org/wiki/Skew_normal_distribution
 */
export function skewNormalRandom(location: number, scale: number, shape = 0.0): number {
    if (shape === 0.0) {
        return normalMarsagliaRandom(location, scale);
    }
    const [u0, v] = normalMarsagliaRandomPair();
    const delta = shape / Math.sqrt(1 + shape * shape);
    const u1 = delta * u0 + Math.sqrt(1 - delta * delta) * v;
    const z = u0 >= 0 ? u1 : -u1;
    return location + scale * z;
}

export function circlesIntersection(centre0: XY, centre1: XY, r0: number, r1: number): [XY, XY] | undefined {
    const dx = centre1.x - centre1.x;
    const dy = centre1.y - centre0.y;

    const distance = Math.sqrt(dy * dy + dx * dx);

    // check whether the cirles do not intersect of one is completely confined within another
    if (distance > r0 + r1 || distance < Math.abs(r0 - r1)) {
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
