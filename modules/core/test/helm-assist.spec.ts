import { MovementTestMetrics, ShipTestHarness, SpeedTestMetrics, TimedTestMetrics } from './ship-test-harness';
import {
    XY,
    limitPercision,
    matchGlobalSpeed,
    moveToTarget,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    toDegreesDelta,
} from '../src';
import { GraphPointInput } from './ploty-graph-builder';
import { expect } from 'chai';
import fc from 'fast-check';
import { floatIn } from './properties';

const iterationsPerSecond = 20;
describe('helm assist', function () {
    jest.setTimeout(60 * 1000);
    describe('assumptions', () => {
        it('rotationCapacity is max speed per second in turnSpeed', () => {
            const harness = new ShipTestHarness();
            const time = 5;
            harness.shipObj.turnSpeed = -1 * time * harness.shipState.maneuvering.design.rotationCapacity;
            harness.shipMgr.state.smartPilot.rotation = 1;
            const metrics = new TimedTestMetrics(iterationsPerSecond, time, Math.abs(harness.shipObj.turnSpeed));
            harness.simulate(metrics.timeToReach, metrics.iterations);
            expect(harness.shipObj.turnSpeed, 'turnSpeed').to.be.closeTo(0, metrics.errorMargin);
        });
    });
    describe('rotateToTarget', () => {
        const target = XY.byLengthAndDirection(100, 0); // always aim at (100, 0), meaning target angle is 0
        it('acheives target direction in a reasonable time', () => {
            fc.assert(
                fc.property(floatIn(179, 30), (originalAngle: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.angle = originalAngle;
                    const metrics = new MovementTestMetrics(
                        iterationsPerSecond,
                        Math.abs(originalAngle),
                        harness.shipState.maneuvering.design.rotationCapacity,
                        harness.shipState.smartPilot.design.maxTurnSpeed,
                    );
                    harness.initGraph({
                        angle: () => toDegreesDelta(harness.shipState.angle),
                        turnSpeed: () => harness.shipState.turnSpeed,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const rotation = rotateToTarget(time, harness.shipState, target, 0);
                        p?.addtoLine('rotation', rotation);
                        harness.shipMgr.state.smartPilot.rotation = rotation;
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test position');
                    expect(toDegreesDelta(harness.shipObj.angle), 'angle').to.be.closeTo(0, metrics.errorMargin);
                    // harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    // expect(toDegreesDelta(harness.shipObj.angle), 'angle after stabling').to.be.closeTo(
                    //     0,
                    //     metrics.errorMargin
                    // );
                }),
            );
        });
    });
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            fc.assert(
                fc.property(floatIn(100), (turnSpeed: number) => {
                    const harness = new ShipTestHarness();
                    const metrics = new SpeedTestMetrics(
                        iterationsPerSecond,
                        Math.abs(turnSpeed),
                        harness.shipState.maneuvering.design.rotationCapacity,
                    );
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.initGraph({
                        rotation: () => harness.shipState.rotation,
                        turnSpeed: () => harness.shipState.turnSpeed,
                    });
                    const iteration = (time: number) => {
                        const rotation = rotationFromTargetTurnSpeed(time, harness.shipState, 0);
                        harness.shipMgr.state.smartPilot.rotation = rotation;
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test turnSpeed');
                    expect(limitPercision(harness.shipObj.turnSpeed), 'turnSpeed').to.be.closeTo(
                        0,
                        metrics.errorMargin,
                    );
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(limitPercision(harness.shipObj.turnSpeed), 'turnSpeed after stabling').to.be.closeTo(
                        0,
                        metrics.stabilizationErrorMargin,
                    );
                }),
            );
        });
    });
    // Regression coverage for issue #2022: a paused tick calls these helpers with
    // deltaSeconds === 0. A ship already at its target speed/position/heading (the common
    // resting state) must not turn that into a NaN maneuvering/rotation command.
    describe('at deltaSeconds=0 (paused)', () => {
        it('matchGlobalSpeed returns finite output when already at target speed', () => {
            const harness = new ShipTestHarness();
            const maneuvering = matchGlobalSpeed(0, harness.shipState, XY.zero);
            expect(Number.isNaN(maneuvering.boost), 'boost').to.equal(false);
            expect(Number.isNaN(maneuvering.strafe), 'strafe').to.equal(false);
        });
        it('moveToTarget returns finite output when already at the target position', () => {
            const harness = new ShipTestHarness();
            const maneuvering = moveToTarget(0, harness.shipState, XY.zero);
            expect(Number.isNaN(maneuvering.boost), 'boost').to.equal(false);
            expect(Number.isNaN(maneuvering.strafe), 'strafe').to.equal(false);
        });
        it('rotateToTarget returns finite output when already facing the target', () => {
            const harness = new ShipTestHarness();
            const target = XY.byLengthAndDirection(100, 0);
            const rotation = rotateToTarget(0, harness.shipState, target, 0);
            expect(Number.isNaN(rotation), 'rotation').to.equal(false);
        });
        it('rotationFromTargetTurnSpeed returns finite output when already at target turnSpeed', () => {
            const harness = new ShipTestHarness();
            const rotation = rotationFromTargetTurnSpeed(0, harness.shipState, 0);
            expect(Number.isNaN(rotation), 'rotation').to.equal(false);
        });
    });
});
