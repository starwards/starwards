import { XY } from './xy';

export const MAX_SAFE_FLOAT = Math.pow(2, 39);
export const EPSILON = 0.01;
const TWO_PI = Math.PI * 2;

export type RTuple2 = readonly [number, number];

export type Tuple2 = [number, number];

export function calcArcAngle(arcLength: number, radius: number) {
    return arcLength / radius / degToRad;
}
/**
 * simple sin wave with control over period/frequency
 * from:  https://riptutorial.com/javascript/example/10173/periodic-functions-using-math-sin
 * @param time time in seconds when you want to get a sample
 * @param frequency number of oscillations per second
 * @param amplitude distance from the lowest value and highest value during one cycle
 * @param phase offset in terms of frequency from the start of the oscillations
 * @param offset moves the whole wave up or down
 * @returns wave value
 */
export function sinWave(time: number, frequency = 1, amplitude = 1, phase = 0, offset = 0) {
    return Math.sin(time * frequency * TWO_PI + phase * TWO_PI) * amplitude + offset;
}

function* concatinateArchsAcyclic(archs: Iterable<RTuple2>) {
    let curr: Tuple2 | null = null;
    for (const arch of archs) {
        if (curr && toPositiveDegreesDelta(curr[1]) >= toPositiveDegreesDelta(arch[0])) {
            curr[1] = arch[1];
        } else {
            if (curr) yield curr;
            curr = [...arch];
        }
    }
    if (curr) yield curr;
}

function* shiftPushIter<T>(orig: Iterable<T>) {
    const iter = orig[Symbol.iterator]();
    const headResult = iter.next();
    if (!headResult.done) {
        yield* { [Symbol.iterator]: () => iter };
        yield headResult.value;
    }
}

export function* concatinateArchs(archs: Iterable<RTuple2>): Iterable<RTuple2> {
    yield* concatinateArchsAcyclic(shiftPushIter(concatinateArchsAcyclic(archs)));
}

export function archIntersection(a: RTuple2, b: RTuple2): boolean {
    const aNorm = [0, toPositiveDegreesDelta(a[1] - a[0])];
    const bNorm = [toPositiveDegreesDelta(b[0] - a[0]), toPositiveDegreesDelta(b[1] - a[0])];
    return bNorm[0] >= bNorm[1] || bNorm[0] <= aNorm[1] || bNorm[1] <= aNorm[1];
}

export function padArch(arch: RTuple2, pad: number): RTuple2 {
    return [toPositiveDegreesDelta(arch[0] - pad), toPositiveDegreesDelta(arch[1] + pad)];
}
/**
 * normalize drgrees to value between (0, 360]
 */
export function toStrictPositiveDegreesDelta(degrees: number) {
    const deg = degrees % 360;
    if (deg <= 0) {
        return deg + 360;
    }
    return deg;
}
/**
 * normalize drgrees to value between [0, 360)
 */
export function toPositiveDegreesDelta(degrees: number) {
    const deg = degrees % 360;
    if (deg < 0) {
        return deg + 360;
    }
    return deg;
}

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

export function lerp(fromRange: RTuple2, toRange: RTuple2, fromValue: number) {
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

type Circle = {
    readonly position: XY;
    readonly radius: number;
};
/**
 * The method calculates the two intersection points between circles with given centres and given radii.
 * It returns the points in the order that the arc for circle0 is from the first to the second returned point.
 * The arc for circle1 is from the second to the first intersection point
 */
export function circlesIntersection(subject: Circle, object: Circle): [XY, XY] | undefined {
    let objPosition = object.position;
    if (XY.lengthOf(XY.difference(object.position, subject.position)) < subject.radius) {
        // move object to diameter of subject
        objPosition = XY.add(
            subject.position,
            XY.byLengthAndDirection(subject.radius, XY.angleOf(XY.difference(object.position, subject.position)))
        );
    }

    const dx = objPosition.x - subject.position.x;
    const dy = objPosition.y - subject.position.y;

    const distance = Math.sqrt(dy * dy + dx * dx);

    // check whether the cirles do not intersect of one is completely confined within another
    if (distance > subject.radius + object.radius) {
        // eslint-disable-next-line no-console
        console.log(
            `no intersection distance: ${distance}, (x0, y0): ${subject.position.x}, ${subject.position.y}, subject.radius = ${subject.radius}, (x1, y1): ${objPosition.x}, ${objPosition.y}, object.radius = ${object.radius}`
        );
        return undefined;
    }

    /**
     * point2 is the intersection between the chord between the intersection points
     * and a line that passes through both circle centres.
     */
    const a =
        (subject.radius * subject.radius - object.radius * object.radius + distance * distance) / (2.0 * distance);
    const p2 = { x: subject.position.x + (dx * a) / distance, y: subject.position.y + (dy * a) / distance };

    // h is the distance from p2 and either of the circle intersection points
    const h = Math.sqrt(subject.radius * subject.radius - a * a);

    // ox and oy are the offsets of the intersection points from p2
    const ox = -dy * (h / distance);
    const oy = dx * (h / distance);

    // i0 and i1 are the intersection points
    const i0 = { x: p2.x + ox, y: p2.y + oy };
    const i1 = { x: p2.x - ox, y: p2.y - oy };

    if (
        (objPosition.x > subject.position.x && i0.y > i1.y) ||
        (subject.position.x > objPosition.x && i1.y > i0.y) ||
        (subject.position.x === objPosition.x &&
            ((objPosition.y > subject.position.y && i1.x > i0.x) ||
                (subject.position.y > objPosition.y && i0.x > i1.x)))
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

type Sign = 1 | -1 | 0;
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
