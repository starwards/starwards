import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import { limitPercision, moveToTarget, rotationFromTargetTurnSpeed, Vec2, XY } from '../src';
import { GraphPointInput } from './ploty-graph-builder';
import { floatIn, xy } from './properties';
import { MovementTestMetrics, ShipTestHarness } from './ship-test-harness';

describe('helm assist', () => {
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            const MIN_GRACE = 0.01;
            const MIN_TIME = 1;
            fc.assert(
                fc.property(floatIn(2000), fc.integer(10, 100), (turnSpeed: number, iterations: number) => {
                    const harness = new ShipTestHarness();
                    const turnSpeedDiff = Math.abs(turnSpeed);
                    const errorMargin = Math.max(MIN_GRACE, turnSpeedDiff / Math.sqrt(iterations));
                    const timeToReach = Math.max(MIN_TIME, turnSpeedDiff / harness.shipState.rotationCapacity);
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.simulate(timeToReach, iterations, (time: number) => {
                        const rotation = rotationFromTargetTurnSpeed(harness.shipState, 0, time);
                        harness.shipMgr.setRotation(rotation);
                    });
                    expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(0, errorMargin);
                })
            );
        });
    });

    describe('moveToTarget', () => {
        it('(boost only) reach target in good time from 0 speed', () => {
            fc.assert(
                fc.property(floatIn(2000, 100), fc.integer(15, 20), (fromX: number, iterationsPerSecond: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position.x = fromX;
                    const metrics = new MovementTestMetrics(
                        iterationsPerSecond,
                        Math.abs(fromX),
                        harness.shipState.boostCapacity
                    );
                    harness.initGraph(
                        {
                            position: () => harness.shipState.position.x,
                            velocity: () => harness.shipState.velocity.x,
                        },
                        ['boost']
                    );
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = moveToTarget(time, harness.shipState, XY.zero, p?.annotate);
                        p?.addtoLine('boost', maneuvering.boost);
                        harness.shipMgr.setBoost(maneuvering.boost);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test position');
                    expect(harness.shipObj.position.x, 'position').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.position.x, 'position after stabling').to.be.closeTo(
                        0,
                        metrics.logErrorMargin
                    );
                })
            );
        });

        it('acheives target location in a reasonable time from 0 speed', () => {
            fc.assert(
                fc.property(xy(2000, 100), fc.integer(15, 20), (from: XY, iterationsPerSecond: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position = Vec2.make(from);
                    const metrics = new MovementTestMetrics(
                        iterationsPerSecond,
                        XY.lengthOf(from),
                        harness.shipState.movementCapacity
                    );
                    const iteration = (time: number) => {
                        const maneuvering = moveToTarget(time, harness.shipState, XY.zero);
                        harness.shipMgr.setBoost(maneuvering.boost);
                        harness.shipMgr.setStrafe(maneuvering.strafe);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(XY.lengthOf(harness.shipObj.position)).to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(XY.lengthOf(harness.shipObj.position), 'position after stabling').to.be.closeTo(
                        0,
                        metrics.logErrorMargin
                    );
                })
            );
        });
    });
});
