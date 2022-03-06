import { EPSILON, XY, limitPercisionHard, sign } from '../src';

import fc from 'fast-check';

export const safeFloat = () => floatIn(Math.pow(2, 30));
export const xy = (range: number, minRange = 0) =>
    fc.tuple(floatIn(360), floatIn(range, minRange)).map<XY>((t) => XY.rotate(XY.scale(XY.one, t[1]), t[0]));
export const floatIn = (range: number, minRange = 0) =>
    fc
        .float(-range, range)
        .filter((n) => Math.abs(n) >= minRange)
        .map(limitPercisionHard);
export const float = (from: number, to: number) => fc.float(from, to).map(limitPercisionHard);
export const fromTo = (range: number, minDiff: number) =>
    fc.tuple(floatIn(range), floatIn(range)).filter((t) => Math.abs(t[0] - t[1]) > minDiff);
export const differentSignTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => sign(t[0]) != sign(t[1]));
export const orderedTuple2 = () => fc.tuple(safeFloat(), safeFloat()).map((t) => t.sort((a, b) => a - b));
export const orderedTuple3 = () => fc.tuple(safeFloat(), safeFloat(), safeFloat()).map((t) => t.sort((a, b) => a - b));

export const degree = () => float(0, 360 - EPSILON);
export type Tuple4 = [number, number, number, number];

export const orderedDegreesTuple4 = () =>
    float(-360 * 2, 360).chain((delta) =>
        fc
            .tuple(degree(), degree(), degree(), degree())
            .map((t) => t.sort((a, b) => a - b).map((x) => x + delta) as Tuple4)
            .filter((t) => t[0] < t[1] && t[1] < t[2] && t[2] < t[3])
    );
