import { XY } from './xy';

/**
 * translate drgrees to value between [-180, 180]
 */
export function toDegreesDelta(degrees: number) {
    const deg = degrees % 360;
    if (isInRange(-180, 180, deg)) {
        return deg;
    } else {
        return (deg + negSign(deg) * 360) % 360;
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

export function capToMagnitude(base: number, order: number, value: number) {
    const fraction = order / 100;
    const absLow = base / order;
    const absHigh = base * order;
    return base > 0
        ? capToRange(absLow - fraction, absHigh + fraction, value)
        : capToRange(absHigh - fraction, absLow + fraction, value);
}
/**
 *  generate a random number with a given mean and standard deviation
 */
export function gaussianRandom(mean: number, stdev: number): number {
    return mean + 2.0 * stdev * (Math.random() + Math.random() + Math.random() - 1.5);
}
export function addScale(orig: XY, deriv: XY, time: number) {
    return XY.add(orig, XY.scale(deriv, time));
}

// x(t)=x0+v0t+(at^2)/2
export function equasionOfMotion(pos: XY, vel: XY, acc: XY, seconds: number) {
    return addScale(addScale(pos, vel, seconds), acc, 0.5 * seconds * seconds);
}

// x(t)=x0+v0t+(at^2)/2
export function scalarEquasionOfMotion(x0: number, v0: number, a: number, t: number) {
    return x0 + v0 * t + (a / 2) * t * t;
}

export function whereWillItStop(x0: number, v0: number, a: number) {
    if (v0 === 0) {
        return x0;
    } else if (sign(v0) === sign(a)) {
        return Infinity;
    } else {
        return scalarEquasionOfMotion(0, v0, a, Math.abs(v0 / a));
    }
}

export function limitPercision(num: number) {
    return Math.trunc(num * 1e3) / 1e3;
    // if (num > 1e5 || num < -1e5) {
    //     return Math.trunc(num);
    // } else {
    //     // const f32 = Math.fround(num);
    //     // if (isFinite(f32)) {
    //     //     return f32;
    //     // }
    //     return Math.fround(Math.trunc(num * 1e3) / 1e3);
    // }
}

export type Sign = 1 | -1 | 0;
export function sign(x: number): Sign {
    return typeof x === 'number' && x ? (x < 0 ? -1 : 1) : 0;
}

export function negSign(x: number): Sign {
    return typeof x === 'number' && x ? (x < 0 ? 1 : -1) : 0;
}
