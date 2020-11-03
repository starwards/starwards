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
import { limitPercision } from '../logic/formulas';
import { XY } from '../logic/xy';

export class Vec2 extends Schema implements XY {
    public static add(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = limitPercision(vector.x + vector2.x);
        dest.y = limitPercision(vector.y + vector2.y);

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
        dest.x = limitPercision(ca * vector.x - sa * vector.y);
        dest.y = limitPercision(sa * vector.x - ca * vector.y);
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
        return limitPercision(vector.x * vector2.x + vector.y * vector2.y);
    }

    public static distance(vector: XY, vector2: XY): number {
        return limitPercision(Math.hypot(vector2.x - vector.x, vector2.y - vector.y));
    }

    public static squaredDistance(vector: XY, vector2: XY): number {
        const x = vector2.x - vector.x;
        const y = vector2.y - vector.y;

        return limitPercision(x * x + y * y);
    }

    public static direction(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        const x = limitPercision(vector.x - vector2.x);
        const y = limitPercision(vector.y - vector2.y);

        let length = Math.hypot(x, y);

        if (length === 0) {
            dest.x = 0;
            dest.y = 0;

            return dest;
        }

        length = 1 / length;

        dest.x = limitPercision(x * length);
        dest.y = limitPercision(y * length);

        return dest;
    }

    public static scale(vector: XY, value: number, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = limitPercision(vector.x * value);
        dest.y = limitPercision(vector.y * value);

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

        dest.x = limitPercision(x + time * (x2 - x));
        dest.y = limitPercision(y + time * (y2 - y));

        return dest;
    }

    public static sum(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = limitPercision(vector.x + vector2.x);
        dest.y = limitPercision(vector.y + vector2.y);

        return dest;
    }

    public static difference(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = limitPercision(vector.x - vector2.x);
        dest.y = limitPercision(vector.y - vector2.y);

        return dest;
    }

    public static product(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = limitPercision(vector.x * vector2.x);
        dest.y = limitPercision(vector.y * vector2.y);

        return dest;
    }

    public static quotient(vector: XY, vector2: XY, dest?: Vec2): Vec2 {
        if (!dest) {
            dest = new Vec2();
        }

        dest.x = limitPercision(vector.x / vector2.x);
        dest.y = limitPercision(vector.y / vector2.y);

        return dest;
    }

    public static lengthOf(vector: XY): number {
        return Math.hypot(vector.x, vector.y);
    }

    public static squaredLength(vector: XY): number {
        const x = vector.x;
        const y = vector.y;

        return limitPercision(x * x + y * y);
    }

    public static make(vector: XY): Vec2 {
        return new Vec2(vector.x, vector.y);
    }

    @type('float32')
    public x = 0;

    @type('float32')
    public y = 0;

    constructor(x = 0, y = 0) {
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
