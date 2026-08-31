import { Tuple2, degToRad, equasionOfMotion as eom, limitPercision, safeDiv, toDegreesDelta } from './formulas';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace XY {
    export interface Mutable extends XY {
        x: number;
        y: number;
    }
    export const one = Object.freeze({ x: 1, y: 0 }) as XY;
    export const zero = Object.freeze({ x: 0, y: 0 }) as XY;
    export function byLengthAndDirection(length: number, degrees: number) {
        return length ? XY.rotate({ x: length, y: 0 }, toDegreesDelta(degrees)) : XY.zero;
    }
    export function clone(vector: XY): XY {
        return {
            x: vector.x,
            y: vector.y,
        };
    }
    export function tuple({ x, y }: XY): Tuple2 {
        return [x, y];
    }
    export function sum(...vectors: XY[]): XY {
        if (!vectors.length) return zero;
        if (vectors.length === 1) return vectors[0];
        const x = limitPercision(vectors.reduce((acc, curr) => acc + curr.x, 0));
        const y = limitPercision(vectors.reduce((acc, curr) => acc + curr.y, 0));
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function add(vector: XY, vector2: XY): XY {
        if (vector2.x === 0 && vector2.y === 0) return vector;
        if (vector.x === 0 && vector.y === 0) return vector2;
        const x = limitPercision(vector.x + vector2.x);
        const y = limitPercision(vector.y + vector2.y);
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function equasionOfMotion(pos: XY, vel: XY, acc: XY, t: number) {
        const x = limitPercision(eom(pos.x, vel.x, acc.x, t));
        const y = limitPercision(eom(pos.y, vel.y, acc.y, t));
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function difference(vector: XY, vector2: XY) {
        if (vector === vector2) return zero;
        const x = limitPercision(vector.x - vector2.x);
        const y = limitPercision(vector.y - vector2.y);
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function negate(vector: XY): XY {
        if (vector.x === 0 && vector.y === 0) return zero;
        return { x: -vector.x, y: -vector.y };
    }
    export function scale(vector: XY, scalar: number): XY {
        if (scalar === 0 || (vector.x === 0 && vector.y === 0)) return zero;
        if (scalar === 1) return vector;
        return { x: limitPercision(scalar * vector.x), y: limitPercision(scalar * vector.y) };
    }
    export function min(vector: XY, vector2: XY): XY {
        const x = vector.x < vector2.x ? vector.x : vector2.x;
        const y = vector.y < vector2.y ? vector.y : vector2.y;
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function max(vector: XY, vector2: XY): XY {
        const x = vector.x > vector2.x ? vector.x : vector2.x;
        const y = vector.y > vector2.y ? vector.y : vector2.y;
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function absDifference(vector: XY, vector2: XY): XY {
        const x = Math.abs(vector.x - vector2.x);
        const y = Math.abs(vector.y - vector2.y);
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }
    export function inRange(point: XY, start: XY, end: XY): boolean {
        return start.x <= point.x && point.x <= end.x && start.y <= point.y && point.y <= end.y;
    }
    export function rotate(vector: XY, degrees: number) {
        return rotateRadians(vector, degrees * degToRad);
    }
    export function rotateRadians(vector: XY, radians: number) {
        if (vector === zero) return zero;
        const ca = Math.cos(radians);
        const sa = Math.sin(radians);
        const x = limitPercision(ca * vector.x - sa * vector.y);
        const y = limitPercision(sa * vector.x + ca * vector.y);
        if (x === 0 && y === 0) return zero;
        return { x, y };
    }

    export function lengthOf(vector: XY): number {
        return limitPercision(Math.hypot(vector.x, vector.y));
    }
    /** Distance between two points. */
    export function distance(point: XY, point2: XY): number {
        return XY.lengthOf(XY.difference(point, point2));
    }

    export function isZero(vector: XY, threshold = 0.00001): boolean {
        if (vector.x == 0 && vector.y == 0) return true;
        return threshold ? XY.equals(vector, XY.zero, threshold) : false;
    }

    export function isFinite(vector: XY): boolean {
        return Number.isFinite(vector.x) && Number.isFinite(vector.y);
    }

    export function equals(vector1: XY, vector2: XY, threshold = 0.00001): boolean {
        if (Math.abs(vector1.x - vector2.x) > threshold) {
            return false;
        }

        if (Math.abs(vector1.y - vector2.y) > threshold) {
            return false;
        }

        return true;
    }

    export function squaredLength(vector: XY): number {
        const x = vector.x;
        const y = vector.y;

        return x * x + y * y;
    }

    export function normalize(vector: XY) {
        const length = lengthOf(vector);
        if (length === 1) {
            return vector;
        } else if (length === 0) {
            return XY.zero;
        } else {
            return XY.scale(vector, 1 / length);
        }
    }

    export function direction(vector: XY, vector2: XY) {
        return XY.normalize(XY.difference(vector, vector2));
    }

    export function angleOf(vector: XY) {
        if (vector.x === 0)
            // special cases
            return vector.y > 0 ? 90 : vector.y === 0 ? 0 : 270;
        else if (vector.y === 0)
            // special cases
            return vector.x >= 0 ? 0 : 180;

        let ret = Math.atan(vector.y / vector.x) / degToRad;
        if (vector.x < 0 && vector.y < 0)
            // quadrant Ⅲ
            ret = 180 + ret;
        else if (vector.x < 0)
            // quadrant Ⅱ
            ret = 180 + ret;
        // it actually substracts
        else if (vector.y < 0)
            // quadrant Ⅳ
            ret = 270 + (90 + ret); // it actually substracts
        if (ret >= 359.9999) {
            return ret % 360;
        }
        return ret;
    }

    // https://en.wikipedia.org/wiki/Dot_product
    export function dot(vector: XY, vector2: XY): number {
        return limitPercision(vector.x * vector2.x + vector.y * vector2.y);
    }

    export function div(vector: XY, vector2: XY): number {
        return limitPercision((safeDiv(vector.x, vector2.x) + safeDiv(vector.y, vector2.y)) / 2);
    }

    // https://www.ck12.org/book/ck-12-college-precalculus/section/9.6/
    export function projection(vector: XY, dimention: XY): XY {
        const normDimention = XY.normalize(dimention);
        return XY.scale(normDimention, XY.dot(vector, normDimention));
    }
}

export interface XY {
    readonly x: number;
    readonly y: number;
}
