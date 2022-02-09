import { limitPercision } from './formulas';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace XYZ {
    export interface Mutable extends XYZ {
        x: number;
        y: number;
        z: number;
    }
    export const one = Object.freeze({ x: 1, y: 0, z: 0 });
    export const zero = Object.freeze({ x: 0, y: 0, z: 0 });

    export function toTuple(vector: XYZ) {
        return [vector.x, vector.y, vector.z];
    }
    export function lengthOf(vector: XYZ): number {
        return limitPercision(Math.hypot(vector.x, vector.y, vector.z));
    }

    export function scale(vector: XYZ, scalar: number): XYZ {
        return {
            x: limitPercision(scalar * vector.x),
            y: limitPercision(scalar * vector.y),
            z: limitPercision(scalar * vector.z),
        };
    }

    export function normalize(vector: XYZ) {
        const length = XYZ.lengthOf(vector);
        if (length === 1) {
            return vector;
        } else if (length === 0) {
            return XYZ.zero;
        } else {
            return XYZ.scale(vector, 1 / length);
        }
    }
}

export interface XYZ {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}
