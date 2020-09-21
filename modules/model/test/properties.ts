import fc from 'fast-check';
import { limitPercision, sign } from '../src';

export const safeFloat = () => floatIn(Math.pow(2, 30));
export const floatIn = (range: number) => fc.float(-range, range).filter((t) => t === limitPercision(t));
export const differentSignTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => sign(t[0]) != sign(t[1]));
export const orderedTuple2 = () => fc.tuple(safeFloat(), safeFloat()).filter((t) => t[0] < t[1]);
export const orderedTuple3 = () =>
    fc.tuple(safeFloat(), safeFloat(), safeFloat()).filter((t) => t[0] < t[2] && t[0] <= t[1] && t[1] <= t[2]);
