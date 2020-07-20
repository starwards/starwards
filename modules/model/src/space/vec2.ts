/*
 * Copyright (c) 2012, 2018 Matthias Ferch
 *
 * Project homepage: https://github.com/matthiasferch/tsm
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

// This module is an altered version of the original matthiasferch/tsm code.

import { Schema, type } from '@colyseus/schema';

// tslint:disable-next-line:no-namespace
export namespace XY {
    export const one = Object.freeze({ x: 1, y: 0 });
    export const zero = Object.freeze({ x: 0, y: 0 });
    export const degToRad = Math.PI / 180;
    export function add(vector: XY, vector2: XY): XY {
        return {
            x: vector.x + vector2.x,
            y: vector.y + vector2.y,
        };
    }
    export function difference(vector: XY, vector2: XY) {
        return {
            x: vector.x - vector2.x,
            y: vector.y - vector2.y,
        };
    }

    export function negate(vector: XY): XY {
        return { x: -vector.x, y: -vector.y };
    }
    export function scale(vector: XY, scalar: number): XY {
        return { x: scalar * vector.x, y: scalar * vector.y };
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
            x: ca * vector.x - sa * vector.y,
            y: sa * vector.x + ca * vector.y,
        };
    }

    export function lengthOf(vector: XY): number {
        return Math.sqrt(XY.squaredLength(vector));
    }

    export function isZero(vector: XY, threshold = 0.00001): boolean {
        return XY.equals(vector, XY.zero, threshold);
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
        return vector.x * vector2.x + vector.y * vector2.y;
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

export class Vec2 extends Schema implements XY {
    public static add(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x += vector.x + vector2.x;
        dest.y += vector.y + vector2.y;

        return dest;
    }

    public static Rotate(vector: XY, degrees: number, dest?: Vec2) {
        return Vec2.RotateRadians(vector, degrees * XY.degToRad, dest);
    }

    public static RotateRadians(vector: XY, radians: number, dest?: Vec2) {
        if (!dest) {
            dest = new Vec2();
        }

        const ca = Math.cos(radians);
        const sa = Math.sin(radians);
        dest.x = ca * vector.x - sa * vector.y;
        dest.y = sa * vector.x - ca * vector.y;
        return dest;
    }

    // public static cross(vector: XY, vector2: XY, dest?: vec3): vec3 {
    //     if (!dest) { dest = new vec3(); }

    //     const x = vector.x;
    //     const y = vector.y;

    //     const x2 = vector2.x;
    //     const y2 = vector2.y;

    //     const z = x * y2 - y * x2;

    //     dest.x = 0;
    //     dest.y = 0;
    //     dest.z = z;

    //     return dest;
    // }

    public static dot(vector: XY, vector2: XY): number {
        return vector.x * vector2.x + vector.y * vector2.y;
    }

    public static distance(vector: XY, vector2: XY): number {
        return Math.sqrt(this.squaredDistance(vector, vector2));
    }

    public static squaredDistance(vector: XY, vector2: XY): number {
        const x = vector2.x - vector.x;
        const y = vector2.y - vector.y;

        return x * x + y * y;
    }

    public static direction(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        const x = vector.x - vector2.x;
        const y = vector.y - vector2.y;

        let length = Math.sqrt(x * x + y * y);

        if (length === 0) {
            dest.x = 0;
            dest.y = 0;

            return dest;
        }

        length = 1 / length;

        dest.x = x * length;
        dest.y = y * length;

        return dest;
    }

    public static scale(vector: XY, value: number, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = vector.x * value;
        dest.y = vector.y * value;

        return dest;
    }

    public static mix(vector: XY, vector2: XY, time: number, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        const x = vector.x;
        const y = vector.y;

        const x2 = vector2.x;
        const y2 = vector2.y;

        dest.x = x + time * (x2 - x);
        dest.y = y + time * (y2 - y);

        return dest;
    }

    public static sum(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = vector.x + vector2.x;
        dest.y = vector.y + vector2.y;

        return dest;
    }

    public static difference(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = vector.x - vector2.x;
        dest.y = vector.y - vector2.y;

        return dest;
    }

    public static product(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = vector.x * vector2.x;
        dest.y = vector.y * vector2.y;

        return dest;
    }

    public static quotient(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = vector.x / vector2.x;
        dest.y = vector.y / vector2.y;

        return dest;
    }

    public static lengthOf(vector: XY): number {
        return Math.sqrt(this.squaredLength(vector));
    }

    public static squaredLength(vector: XY): number {
        const x = vector.x;
        const y = vector.y;

        return x * x + y * y;
    }

    @type('float32')
    public x: number = 0;

    @type('float32')
    public y: number = 0;

    constructor(x: number = 0, y: number = 0) {
        super();
        this.x = x;
        this.y = y;
    }
    /*
    if one of these methods are needed, move it to static
    public at(index: number): number {
        switch (index) {
            case 0: return this.x;
            case 1: return this.y;
            default: throw new Error(`not supported ${index}th dimention`);
        }
    }

    public reset(): void {
        this.x = 0;
        this.y = 0;
    }

    public copy(dest?: Vec2): Vec2 {
        if (!dest) { dest = new Vec2(); }

        dest.x = this.x;
        dest.y = this.y;

        return dest;
    }

    public equals(vector: XY, threshold = epsilon): boolean {
        if (Math.abs(this.x - vector.x) > threshold) {
            return false;
        }

        if (Math.abs(this.y - vector.y) > threshold) {
            return false;
        }

        return true;
    }

    public subtract(vector: XY): this {
        this.x -= vector.x;
        this.y -= vector.y;

        return this;
    }

    public multiply(vector: XY): this {
        this.x *= vector.x;
        this.y *= vector.y;

        return this;
    }

    public divide(vector: XY): this {
        this.x /= vector.x;
        this.y /= vector.y;

        return this;
    }

    public normalize(dest?: Vec2): Vec2 {
        if (!dest) { dest = this; }

        let length = this.length();

        if (length === 1) {
            return this;
        }

        if (length === 0) {
            dest.x = 0;
            dest.y = 0;

            return dest;
        }

        length = 1.0 / length;

        dest.x *= length;
        dest.y *= length;

        return dest;
    }

    public multiplyMat2(matrix: mat2, dest?: Vec2): Vec2 {
        if (!dest) { dest = this; }

        return new Vec2(matrix.multiplyVec2(this as any, dest as any).xy);
    }

    public multiplyMat3(matrix: mat3, dest?: Vec2): Vec2 {
        if (!dest) { dest = this; }

        return new Vec2(matrix.multiplyVec2(this as any, dest as any).xy);
    }
    */
}
