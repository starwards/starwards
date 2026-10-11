import { ShipDirection, ShipDirections, Vec2, XY, matchGlobalSpeed } from '../src';
import { ShipTestHarness, SpeedTestMetrics } from './ship-test-harness';
import { float, floatIn, xy } from './properties';
import { GraphPointInput } from './ploty-graph-builder';
import { expect } from 'chai';
import fc from 'fast-check';

const iterationsPerSecond = 20;
describe('helm assist', function () {
    jest.setTimeout(60 * 1000);
    describe('matchGlobalSpeed', () => {
        it('(FWD only) reach target speed in good time from 0 speed', () => {
            fc.assert(
                fc.property(floatIn(1000, 250), float(0, 0.5), (fromX: number, afterBurner: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                    harness.shipObj.velocity.x = -fromX;
                    const metrics = new SpeedTestMetrics(
                        iterationsPerSecond,
                        Math.abs(fromX),
                        harness.shipState.velocityCapacity(ShipDirection.FWD),
                    );
                    harness.initGraph({
                        velocity: () => harness.shipState.velocity.x,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = matchGlobalSpeed(time, harness.shipState, XY.zero);
                        p?.addtoLine('boost', maneuvering.boost);
                        harness.shipMgr.state.smartPilot.maneuvering.x = maneuvering.boost;
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test velocity');
                    expect(harness.shipObj.velocity.x, 'velocity').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.velocity.x, 'velocity after stabling').to.be.closeTo(
                        0,
                        metrics.stabilizationErrorMargin,
                    );
                }),
            );
        });
        it('acheives target speed in a reasonable time from 0 speed', () => {
            fc.assert(
                fc.property(
                    xy(1000, 250),
                    floatIn(180),
                    float(0, 0.5),
                    (from: XY, angle: number, afterBurner: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                        harness.shipObj.angle = angle;
                        harness.shipObj.velocity = Vec2.make(from);
                        const metrics = new SpeedTestMetrics(
                            20,
                            XY.lengthOf(from),
                            Math.min(...ShipDirections.map((d) => harness.shipState.velocityCapacity(d))),
                        );
                        harness.initGraph({
                            velocityX: () => harness.shipState.velocity.x,
                            velocityY: () => harness.shipState.velocity.y,
                            velocity: () => XY.lengthOf(harness.shipObj.velocity),
                        });
                        const iteration = (time: number, p?: GraphPointInput) => {
                            const maneuvering = matchGlobalSpeed(time, harness.shipState, XY.zero);
                            p?.addtoLine('boost', maneuvering.boost);
                            p?.addtoLine('strafe', maneuvering.strafe);
                            harness.shipMgr.state.smartPilot.maneuvering.x = maneuvering.boost;
                            harness.shipMgr.state.smartPilot.maneuvering.y = maneuvering.strafe;
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        harness.annotateGraph('test velocity');
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity after stabling').to.be.closeTo(
                            0,
                            metrics.stabilizationErrorMargin,
                        );
                    },
                ),
            );
        });
    });
});
