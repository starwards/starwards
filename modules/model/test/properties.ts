import fc from 'fast-check';
import { limitPercision, sign, XY } from '../src';

export const safeFloat = () => floatIn(Math.pow(2, 30));
export const xy = (range: number) =>
    fc
        .tuple(floatIn(range), floatIn(range))
        .map<XY>((t) => ({ x: t[0], y: t[1] }))
        .filter((t) => XY.lengthOf(t) <= range);
export const floatIn = (range: number) => fc.float(-range, range).map(limitPercision);
export const fromTo = (range: number, minDiff: number) =>
    fc.tuple(floatIn(range), floatIn(range)).filter((t) => Math.abs(t[0] - t[1]) > minDiff);
export const differentSignTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => sign(t[0]) != sign(t[1]));
export const orderedTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => t[0] < t[1]);
export const orderedTuple3 = () =>
    fc.tuple(safeFloat(), safeFloat(), safeFloat()).filter((t) => t[0] < t[2] && t[0] <= t[1] && t[1] <= t[2]);
