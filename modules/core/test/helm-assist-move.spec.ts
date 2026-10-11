import { MovementTestMetrics, ShipTestHarness } from './ship-test-harness';
import { ShipDirection, ShipDirections, Vec2, XY, moveToTarget } from '../src';
import { float, floatIn, xy } from './properties';
import { GraphPointInput } from './ploty-graph-builder';
import { expect } from 'chai';
import fc from 'fast-check';

const iterationsPerSecond = 20;
describe('helm assist', function () {
    jest.setTimeout(60 * 1000);
    describe('moveToTarget', () => {
        it('(FWD only) reach target in good time from 0 speed', () => {
            fc.assert(
                fc.property(floatIn(2000, 500), float(0, 0.5), (fromX: number, afterBurner: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                    harness.shipObj.position.x = -fromX;
                    const metrics = new MovementTestMetrics(
                        iterationsPerSecond,
                        Math.abs(fromX),
                        harness.shipState.velocityCapacity(ShipDirection.FWD),
                        harness.shipState.maxSpeed,
                    );
                    harness.initGraph({
                        position: () => harness.shipState.position.x,
                        velocity: () => harness.shipState.velocity.x,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = moveToTarget(time, harness.shipState, XY.zero);
                        p?.addtoLine('boost', maneuvering.boost);
                        harness.shipMgr.state.smartPilot.maneuvering.x = maneuvering.boost;
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test position');
                    expect(harness.shipObj.position.x, 'position').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.position.x, 'position after stabling').to.be.closeTo(
                        0,
                        metrics.stabilizationErrorMargin,
                    );
                }),
            );
        });
        it('acheives target location in a reasonable time from 0 speed', () => {
            fc.assert(
                fc.property(
                    xy(2000, 500),
                    floatIn(179),
                    float(0, 0.5),
                    (from: XY, angle: number, afterBurner: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                        harness.shipObj.angle = angle;
                        harness.shipObj.position = Vec2.make(from);
                        const metrics = new MovementTestMetrics(
                            20,
                            XY.lengthOf(from),
                            Math.min(...ShipDirections.map((d) => harness.shipState.velocityCapacity(d))),
                            harness.shipState.maxSpeed,
                        );
                        const iteration = (time: number) => {
                            const maneuvering = moveToTarget(time, harness.shipState, XY.zero);
                            harness.shipMgr.state.smartPilot.maneuvering.x = maneuvering.boost;
                            harness.shipMgr.state.smartPilot.maneuvering.y = maneuvering.strafe;
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.position), 'position').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.position), 'position after stabling').to.be.closeTo(
                            0,
                            metrics.stabilizationErrorMargin,
                        );
                    },
                ),
            );
        });
    });
});
