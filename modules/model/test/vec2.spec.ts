import { expect } from 'chai';
import 'mocha';
import { XY } from '../src';

describe('model', () => {
    describe('XY.angleOf()', () => {
        it('complies with XY.rotate() for normal vectors', () => {
            const vec = { x: 1, y: 0 };
            for (let i = 0; i < 720; i += 5) {
                expect(XY.angleOf(XY.rotate(vec, i)), `vector rotated ${i} degrees`).to.be.closeTo(i % 360, 0.001);
            }
        });
        it('complies with XY.rotate() for large vectors', () => {
            const vec = { x: 12345, y: 0 };
            for (let i = 0; i < 720; i += 5) {
                expect(XY.angleOf(XY.rotate(vec, i)), `vector rotated ${i} degrees`).to.be.closeTo(i % 360, 0.001);
            }
        });
        it('correct on sanity cases', () => {
            expect(XY.angleOf({ x: 1, y: 0 }), `{ x: 1, y: 0 }`).to.be.closeTo(0, 0.001);
            expect(XY.angleOf({ x: 1, y: 1 }), `{ x: 1, y: 1 }`).to.be.closeTo(45, 0.001);
            expect(XY.angleOf({ x: 0, y: 1 }), `{ x: 0, y: 1 }`).to.be.closeTo(90, 0.001);
            expect(XY.angleOf({ x: -1, y: 1 }), `{ x: -1, y: 1 }`).to.be.closeTo(135, 0.001);
            expect(XY.angleOf({ x: -1, y: 0 }), `{ x: -1, y: 0 }`).to.be.closeTo(180, 0.001);
            expect(XY.angleOf({ x: -1, y: -1 }), `{ x: -1, y: -1 }`).to.be.closeTo(225, 0.001);
            expect(XY.angleOf({ x: 0, y: -1 }), `{ x: 0, y: -1 }`).to.be.closeTo(270, 0.001);
            expect(XY.angleOf({ x: 1, y: -1 }), `{ x: 1, y: -1 }`).to.be.closeTo(315, 0.001);
        });
    });
});
