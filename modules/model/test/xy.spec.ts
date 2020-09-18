import { expect } from 'chai';
import 'mocha';
import { XY } from '../src';
import fc from 'fast-check';

const GRACE = 0.1;

const assertRotation = (vec: XY) => (deg: number) =>
    void expect(XY.angleOf(XY.rotate(vec, deg)), `vector rotated ${deg} degrees`).to.be.closeTo(deg % 360, GRACE);

describe('model', () => {
    describe('XY.angleOf()', () => {
        it('complies with XY.rotate() for normal vectors', () => {
            fc.assert(fc.property(fc.integer(0, 720), assertRotation({ x: 1, y: 0 })));
        });
        it('complies with XY.rotate() for large vectors', () => {
            fc.assert(fc.property(fc.integer(0, 720), assertRotation({ x: 12345, y: 0 })));
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
