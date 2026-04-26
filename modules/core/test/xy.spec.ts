import { XY, limitPercision, toDegreesDelta } from '../src';
import { float, floatIn } from './properties';

import { expect } from 'chai';
import fc from 'fast-check';

const GRACE = 0.1;
const safeDeg = 180 - GRACE;
const assertRotation = (vec: XY) => (deg: number) =>
    void expect(toDegreesDelta(XY.angleOf(XY.rotate(vec, deg))), `vector rotated ${deg} degrees`).to.be.closeTo(
        toDegreesDelta(deg),
        GRACE,
    );

describe('core', () => {
    describe('XY zero-constant optimization', () => {
        it('XY.difference returns XY.zero reference when vectors are identical', () => {
            const v = { x: 3, y: 4 };
            expect(XY.difference(v, v)).to.equal(XY.zero);
        });
        it('XY.difference returns XY.zero reference when result is zero', () => {
            const a = { x: 5, y: 7 };
            const b = { x: 5, y: 7 };
            expect(XY.difference(a, b)).to.equal(XY.zero);
        });
        it('XY.add returns XY.zero reference when both inputs are zero', () => {
            expect(XY.add(XY.zero, XY.zero)).to.equal(XY.zero);
        });
        it('XY.add shortcut fires for XY.difference result (hot path)', () => {
            const pos = { x: 10, y: 20 };
            const offset = { x: 3, y: 4 };
            // XY.difference(offset, offset) should return XY.zero by reference
            // so XY.add shortcut should return pos unchanged
            const result = XY.add(pos, XY.difference(offset, offset));
            expect(result).to.equal(pos);
        });
        it('XY.scale by 0 returns XY.zero reference', () => {
            expect(XY.scale({ x: 5, y: 3 }, 0)).to.equal(XY.zero);
        });
        it('XY.scale of XY.zero returns XY.zero reference', () => {
            expect(XY.scale(XY.zero, 42)).to.equal(XY.zero);
        });
        it('XY.negate of XY.zero returns XY.zero reference', () => {
            expect(XY.negate(XY.zero)).to.equal(XY.zero);
        });
    });
    describe('XY.byLengthAndDirection() ', () => {
        it('is correct angle and length', () =>
            fc.assert(
                fc.property(float(1, 100).map(limitPercision), floatIn(safeDeg), (length: number, deg: number) => {
                    const vec = XY.byLengthAndDirection(length, deg);
                    expect(XY.lengthOf(vec), `vector length ${length}`).to.be.closeTo(length, GRACE);
                    expect(toDegreesDelta(XY.angleOf(vec)), `vector rotated ${deg} degrees`).to.be.closeTo(
                        toDegreesDelta(deg),
                        GRACE,
                    );
                }),
            ));
    });
    describe('XY.angleOf()', () => {
        it('complies with XY.rotate() for normal vectors', () => {
            fc.assert(fc.property(fc.integer({ min: -720, max: 720 }), assertRotation({ x: 1, y: 0 })));
        });
        it('complies with XY.rotate() for large vectors', () => {
            fc.assert(fc.property(fc.integer({ min: -720, max: 720 }), assertRotation({ x: 12345, y: 0 })));
        });
        it('correct on sanity cases', () => {
            expect(XY.angleOf({ x: 1, y: 0 }), `{ x: 1, y: 0 }`).to.be.closeTo(0, GRACE);
            expect(XY.angleOf({ x: 1, y: 1 }), `{ x: 1, y: 1 }`).to.be.closeTo(45, GRACE);
            expect(XY.angleOf({ x: 0, y: 1 }), `{ x: 0, y: 1 }`).to.be.closeTo(90, GRACE);
            expect(XY.angleOf({ x: -1, y: 1 }), `{ x: -1, y: 1 }`).to.be.closeTo(135, GRACE);
            expect(XY.angleOf({ x: -1, y: 0 }), `{ x: -1, y: 0 }`).to.be.closeTo(180, GRACE);
            expect(XY.angleOf({ x: -1, y: -1 }), `{ x: -1, y: -1 }`).to.be.closeTo(225, GRACE);
            expect(XY.angleOf({ x: 0, y: -1 }), `{ x: 0, y: -1 }`).to.be.closeTo(270, GRACE);
            expect(XY.angleOf({ x: 1, y: -1 }), `{ x: 1, y: -1 }`).to.be.closeTo(315, GRACE);
        });
    });
});
