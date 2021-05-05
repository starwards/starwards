import { degToRad, equasionOfMotion as eom, limitPercision, safeDiv, toDegreesDelta } from './formulas';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace XY {
    export interface Mutable extends XY {
        x: number;
        y: number;
    }
    export const one = Object.freeze({ x: 1, y: 0 });
    export const zero = Object.freeze({ x: 0, y: 0 });
    export function byLengthAndDirection(length: number, degrees: number) {
        return length ? XY.rotate({ x: length, y: 0 }, toDegreesDelta(degrees)) : XY.zero;
    }
    export function clone(vector: XY): XY {
        return {
            x: vector.x,
            y: vector.y,
        };
    }
    export function sum(...vectors: XY[]): XY {
        return {
            x: limitPercision(vectors.reduce((acc, curr) => acc + curr.x, 0)),
            y: limitPercision(vectors.reduce((acc, curr) => acc + curr.y, 0)),
        };
    }
    export function add(vector: XY, vector2: XY): XY {
        return {
            x: limitPercision(vector.x + vector2.x),
            y: limitPercision(vector.y + vector2.y),
        };
    }
    export function equasionOfMotion(pos: XY, vel: XY, acc: XY, t: number) {
        return {
            x: limitPercision(eom(pos.x, vel.x, acc.x, t)),
            y: limitPercision(eom(pos.y, vel.y, acc.y, t)),
        };
    }
    export function difference(vector: XY, vector2: XY) {
        return {
            x: limitPercision(vector.x - vector2.x),
            y: limitPercision(vector.y - vector2.y),
        };
    }
    export function negate(vector: XY): XY {
        return { x: -vector.x, y: -vector.y };
    }
    export function scale(vector: XY, scalar: number): XY {
        return { x: limitPercision(scalar * vector.x), y: limitPercision(scalar * vector.y) };
    }
    export function min(vector: XY, vector2: XY): XY {
        return {
            x: vector.x < vector2.x ? vector.x : vector2.x,
            y: vector.y < vector2.y ? vector.y : vector2.y,
        };
    }
    export function max(vector: XY, vector2: XY): XY {
        return {
            x: vector.x > vector2.x ? vector.x : vector2.x,
            y: vector.y > vector2.y ? vector.y : vector2.y,
        };
    }
    export function absDifference(vector: XY, vector2: XY): XY {
        return {
            x: Math.abs(vector.x - vector2.x),
            y: Math.abs(vector.y - vector2.y),
        };
    }
    export function inRange(point: XY, start: XY, end: XY): boolean {
        return start.x <= point.x && point.x <= end.x && start.y <= point.y && point.y <= end.y;
    }
    export function rotate(vector: XY, degrees: number) {
        return rotateRadians(vector, degrees * degToRad);
    }
    export function rotateRadians(vector: XY, radians: number) {
        const ca = Math.cos(radians);
        const sa = Math.sin(radians);
        return {
            x: limitPercision(ca * vector.x - sa * vector.y),
            y: limitPercision(sa * vector.x + ca * vector.y),
        };
    }

    export function lengthOf(vector: XY): number {
        return limitPercision(Math.hypot(vector.x, vector.y));
    }

    export function isZero(vector: XY, threshold = 0.00001): boolean {
        return XY.equals(vector, XY.zero, threshold);
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
