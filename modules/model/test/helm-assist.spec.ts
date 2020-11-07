import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import {
    limitPercision,
    matchGlobalSpeed,
    moveToTarget,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    toDegreesDelta,
    Vec2,
    XY,
} from '../src';
import { GraphPointInput } from './ploty-graph-builder';
import { floatIn, xy } from './properties';
import { MovementTestMetrics, ShipTestHarness, SpeedTestMetrics, TimedTestMetrics } from './ship-test-harness';

describe('helm assist', function () {
    this.timeout(60 * 1000);

    describe('assumptions', () => {
        const time = 5;
        const iterationsPerSecond = 5;
        it('boostCapacity is max speed per second in boost', () => {
            fc.assert(
                fc.property(floatIn(1), (boost: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.velocity.x = -boost * time * harness.shipState.boostCapacity;
                    harness.shipMgr.setBoost(boost);
                    const metrics = new TimedTestMetrics(
                        iterationsPerSecond,
                        time,
                        Math.abs(harness.shipObj.velocity.x)
                    );
                    harness.simulate(metrics.timeToReach, metrics.iterations);
                    expect(harness.shipObj.velocity.x, 'velocity').to.be.closeTo(0, metrics.logErrorMargin);
                })
            );
        });
        it('strafeCapacity is max speed per second in strafe', () => {
            fc.assert(
                fc.property(floatIn(1), (strafe: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.velocity.y = -strafe * time * harness.shipState.strafeCapacity;
                    harness.shipMgr.setStrafe(strafe);
                    const metrics = new TimedTestMetrics(
                        iterationsPerSecond,
                        time,
                        Math.abs(harness.shipObj.velocity.y)
                    );
                    harness.simulate(metrics.timeToReach, metrics.iterations);
                    expect(harness.shipObj.velocity.y, 'velocity').to.be.closeTo(0, metrics.logErrorMargin);
                })
            );
        });
        it('rotationCapacity is max speed per second in turnSpeed', () => {
            fc.assert(
                fc.property(floatIn(1), (rotation: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.turnSpeed = -rotation * time * harness.shipState.rotationCapacity;
                    harness.shipMgr.setRotation(rotation);
                    const metrics = new TimedTestMetrics(
                        iterationsPerSecond,
                        time,
                        Math.abs(harness.shipObj.turnSpeed)
                    );
                    harness.simulate(metrics.timeToReach, metrics.iterations);
                    expect(harness.shipObj.turnSpeed, 'turnSpeed').to.be.closeTo(0, metrics.logErrorMargin);
                })
            );
        });
    });
    describe('rotateToTarget', () => {
        const target = XY.byLengthAndDirection(100, 0); // always aim at (100, 0), meaning target angle is 0
        it('basic scenario acheives target direction in a reasonable time', () => {
            fc.assert(
                fc.property(
                    floatIn(180, 30),
                    fc.integer(15, 20),
                    (originalAngle: number, iterationsPerSecond: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipObj.angle = originalAngle;
                        const metrics = new MovementTestMetrics(
                            iterationsPerSecond,
                            Math.abs(originalAngle),
                            harness.shipState.rotationCapacity
                        );
                        harness.initGraph(
                            {
                                angle: () => toDegreesDelta(harness.shipState.angle),
                                turnSpeed: () => harness.shipState.turnSpeed,
                            },
                            ['rotation']
                        );
                        const iteration = (time: number, p?: GraphPointInput) => {
                            const rotation = rotateToTarget(time, harness.shipState, target, 0, p?.annotate);
                            p?.addtoLine('rotation', rotation);
                            harness.shipMgr.setRotation(rotation);
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        harness.annotateGraph('test position');
                        expect(toDegreesDelta(harness.shipObj.angle), 'angle').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(toDegreesDelta(harness.shipObj.angle), 'position after stabling').to.be.closeTo(
                            0,
                            metrics.logErrorMargin
                        );
                    }
                )
            );
        });
    });
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            fc.assert(
                fc.property(floatIn(1000), fc.integer(15, 20), (turnSpeed: number, iterationsPerSecond: number) => {
                    const harness = new ShipTestHarness();
                    const metrics = new SpeedTestMetrics(
                        iterationsPerSecond,
                        Math.abs(turnSpeed),
                        harness.shipState.rotationCapacity
                    );
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.simulate(metrics.timeToReach, metrics.iterations, (time: number) => {
                        const rotation = rotationFromTargetTurnSpeed(time, harness.shipState, 0);
                        harness.shipMgr.setRotation(rotation);
                    });
                    expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(0, metrics.logErrorMargin);
                })
            );
        });
    });
    describe('matchGlobalSpeed', () => {
        it('(boost only) reach target speed in good time from 0 speed', () => {
            fc.assert(
                fc.property(floatIn(1000), fc.integer(15, 20), (fromX: number, iterationsPerSecond: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.velocity.x = fromX;
                    const metrics = new SpeedTestMetrics(
                        iterationsPerSecond,
                        Math.abs(fromX),
                        harness.shipState.boostCapacity
                    );
                    harness.initGraph(
                        {
                            velocity: () => harness.shipState.velocity.x,
                        },
                        ['boost']
                    );
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = matchGlobalSpeed(time, harness.shipState, XY.zero);
                        p?.addtoLine('boost', maneuvering.boost);
                        harness.shipMgr.setBoost(maneuvering.boost);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test velocity');
                    expect(harness.shipObj.velocity.x, 'velocity').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.velocity.x, 'velocity after stabling').to.be.closeTo(
                        0,
                        metrics.logErrorMargin
                    );
                })
            );
        });
        it('acheives target location in a reasonable time from 0 speed', () => {
            fc.assert(
                fc.property(
                    xy(1000),
                    fc.integer(15, 20),
                    floatIn(180),
                    (from: XY, iterationsPerSecond: number, angle: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipObj.angle = angle;
                        harness.shipObj.velocity = Vec2.make(from);
                        const metrics = new SpeedTestMetrics(
                            iterationsPerSecond,
                            XY.lengthOf(from),
                            harness.shipState.movementCapacity
                        );
                        harness.initGraph(
                            {
                                velocityX: () => harness.shipState.velocity.x,
                                velocityY: () => harness.shipState.velocity.x,
                            },
                            ['boost', 'strafe']
                        );
                        const iteration = (time: number, p?: GraphPointInput) => {
                            const maneuvering = matchGlobalSpeed(time, harness.shipState, XY.zero);
                            p?.addtoLine('boost', maneuvering.boost);
                            p?.addtoLine('strafe', maneuvering.strafe);
                            harness.shipMgr.setBoost(maneuvering.boost);
                            harness.shipMgr.setStrafe(maneuvering.strafe);
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        harness.annotateGraph('test velocity');
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity after stabling').to.be.closeTo(
                            0,
                            metrics.logErrorMargin
                        );
                    }
                )
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
                fc.property(
                    xy(2000, 100),
                    fc.integer(15, 20),
                    floatIn(180),
                    (from: XY, iterationsPerSecond: number, angle: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipObj.angle = angle;
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
                    }
                )
            );
        });
    });
});
