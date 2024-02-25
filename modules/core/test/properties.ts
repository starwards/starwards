import { EPSILON, Tuple2, XY, limitPercisionHard, sign } from '../src';

import fc from 'fast-check';

const f = (num: number) => new Float32Array([num])[0];
export const safeFloat = () => floatIn(Math.pow(2, 30));
export const xy = (range: number, minRange = 0) =>
    fc.tuple(floatIn(360), floatIn(range, minRange)).map<XY>((t) => XY.rotate(XY.scale(XY.one, t[1]), t[0]));
export const floatIn = (range: number, minRange = 0) =>
    fc
        .float({ min: f(-range), max: f(range) })
        .filter((n) => Math.abs(n) >= minRange)
        .map(limitPercisionHard);
export const float = (min: number, max: number) => {
    return fc
        .float({ min: f(min), max: f(max) })
        .filter((t) => !Number.isNaN(t))
        .map(limitPercisionHard);
};
export const range = (min: number, max: number, minDiff = 0) =>
    fc
        .tuple(float(min, max), float(min, max))
        .map((t) => t.sort((a, b) => a - b) as Tuple2)
        .filter((t) => Math.abs(t[0] - t[1]) > minDiff);
export const differentSignTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => sign(t[0]) != sign(t[1]));
export const orderedTuple2 = () =>
    fc
        .tuple(safeFloat(), safeFloat())
        .map((t) => t.sort((a, b) => a - b))
        .filter((t) => t[0] < t[1]);
export const orderedTuple3 = () =>
    fc
        .tuple(safeFloat(), safeFloat(), safeFloat())
        .map((t) => t.sort((a, b) => a - b))
        .filter((t) => t[0] < t[2]);

export const degree = () => float(0.0, 360.0 - EPSILON);
type Tuple4 = [number, number, number, number];

export const orderedDegreesTuple4 = () =>
    float(-360.0 * 2, 360.0).chain((delta) =>
        fc
            .tuple(degree(), degree(), degree(), degree())
            .map((t) => t.sort((a, b) => a - b))
            .filter((t) => t[0] < t[1] && t[1] < t[2] && t[2] < t[3])
            .map((t) => t.map((x) => x + delta) as Tuple4),
    );
