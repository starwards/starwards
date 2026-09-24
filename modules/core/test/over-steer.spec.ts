import { XY, toDegreesDelta } from '../src';
import { expect } from 'chai';
import { overSteer } from '../src/logic/space-manager';

/** Degrees the aim point lies from the velocity's heading, signed toward the waypoint side. */
function turnToAim(headingDegrees: number) {
    const velocity = XY.byLengthAndDirection(100, headingDegrees);
    const aim = overSteer(XY.zero, velocity, { x: 1000, y: 0 });
    return toDegreesDelta(XY.angleOf(aim) - headingDegrees);
}

describe('overSteer', () => {
    it('aims past the waypoint by the heading error while it is small', () => {
        expect(
            toDegreesDelta(XY.angleOf(overSteer(XY.zero, XY.byLengthAndDirection(100, -20), { x: 1000, y: 0 }))),
        ).to.be.closeTo(20, 1e-3);
    });

    for (const heading of [-100, -120, -150, -170, 100, 120, 150, 170]) {
        it(`still turns toward the waypoint from a heading error of ${Math.abs(heading)} degrees`, () => {
            // the waypoint (angle 0) is on the side the heading error points to
            expect(Math.sign(turnToAim(heading))).to.equal(Math.sign(-heading));
        });
    }
});
