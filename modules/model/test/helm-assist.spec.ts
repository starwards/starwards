import 'mocha';

import { MovementTestMetrics, ShipTestHarness, SpeedTestMetrics, TimedTestMetrics } from './ship-test-harness';
import {
    ShipDirection,
    ShipDirections,
    Vec2,
    XY,
    limitPercision,
    matchGlobalSpeed,
    moveToTarget,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    setNumericProperty,
    shipProperties as sp,
    toDegreesDelta,
} from '../src';
import { float, floatIn, xy } from './properties';

import { GraphPointInput } from './ploty-graph-builder';
import { expect } from 'chai';
import fc from 'fast-check';

const iterationsPerSecond = 20;
describe('helm assist', function () {
    this.timeout(60 * 1000);

    describe('assumptions', () => {
        it('turnSpeedCapacity is max speed per second in turnSpeed', () => {
            const harness = new ShipTestHarness();
            const time = 5;
            harness.shipObj.turnSpeed = -1 * time * harness.shipState.turnSpeedCapacity;
            setNumericProperty(harness.shipMgr, sp.rotationCommand, 1, undefined);
            const metrics = new TimedTestMetrics(iterationsPerSecond, time, Math.abs(harness.shipObj.turnSpeed));
            harness.simulate(metrics.timeToReach, metrics.iterations);
            expect(harness.shipObj.turnSpeed, 'turnSpeed').to.be.closeTo(0, metrics.errorMargin);
        });
    });
    describe('rotateToTarget', () => {
        const target = XY.byLengthAndDirection(100, 0); // always aim at (100, 0), meaning target angle is 0
        it.skip('acheives target direction in a reasonable time', () => {
            fc.assert(
                fc.property(floatIn(179, 30), (originalAngle: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.angle = originalAngle;
                    const metrics = new MovementTestMetrics(
                        iterationsPerSecond,
                        Math.abs(originalAngle),
                        harness.shipState.turnSpeedCapacity
                    );
                    harness.initGraph({
                        angle: () => toDegreesDelta(harness.shipState.angle),
                        turnSpeed: () => harness.shipState.turnSpeed,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const rotation = rotateToTarget(time, harness.shipState, target, 0);
                        p?.addtoLine('rotation', rotation);
                        setNumericProperty(harness.shipMgr, sp.rotationCommand, rotation, undefined);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test position');
                    expect(toDegreesDelta(harness.shipObj.angle), 'angle').to.be.closeTo(0, metrics.errorMargin);
                    // harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    // expect(toDegreesDelta(harness.shipObj.angle), 'angle after stabling').to.be.closeTo(
                    //     0,
                    //     metrics.errorMargin
                    // );
                })
            );
        });
    });
    describe('rotationFromTargetTurnSpeed', () => {
        it.skip('acheives target turnSpeed in a reasonable time', () => {
            fc.assert(
                fc.property(floatIn(100), (turnSpeed: number) => {
                    const harness = new ShipTestHarness();
                    const metrics = new SpeedTestMetrics(
                        iterationsPerSecond,
                        Math.abs(turnSpeed),
                        harness.shipState.turnSpeedCapacity
                    );
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.initGraph({
                        rotation: () => harness.shipState.rotation,
                        turnSpeed: () => harness.shipState.turnSpeed,
                    });
                    harness.simulate(metrics.timeToReach, metrics.iterations, (time: number) => {
                        const rotation = rotationFromTargetTurnSpeed(time, harness.shipState, 0);
                        setNumericProperty(harness.shipMgr, sp.rotationCommand, rotation, undefined);
                    });
                    expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(0, metrics.errorMargin);
                })
            );
        });
    });
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
                        harness.shipState.velocityCapacity(ShipDirection.FWD)
                    );
                    harness.initGraph({
                        velocity: () => harness.shipState.velocity.x,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = matchGlobalSpeed(time, harness.shipState, XY.zero);
                        p?.addtoLine('boost', maneuvering.boost);
                        setNumericProperty(harness.shipMgr, sp.boostCommand, maneuvering.boost, undefined);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test velocity');
                    expect(harness.shipObj.velocity.x, 'velocity').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.velocity.x, 'velocity after stabling').to.be.closeTo(
                        0,
                        metrics.sqrtErrorMargin
                    );
                })
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
                            Math.min(...ShipDirections.map((d) => harness.shipState.velocityCapacity(d)))
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
                            setNumericProperty(harness.shipMgr, sp.boostCommand, maneuvering.boost, undefined);
                            setNumericProperty(harness.shipMgr, sp.strafeCommand, maneuvering.strafe, undefined);
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        harness.annotateGraph('test velocity');
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity after stabling').to.be.closeTo(
                            0,
                            metrics.sqrtErrorMargin
                        );
                    }
                )
            );
        });
    });
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
                        harness.shipState.maxSpeed
                    );
                    harness.initGraph({
                        position: () => harness.shipState.position.x,
                        velocity: () => harness.shipState.velocity.x,
                    });
                    const iteration = (time: number, p?: GraphPointInput) => {
                        const maneuvering = moveToTarget(time, harness.shipState, XY.zero);
                        p?.addtoLine('boost', maneuvering.boost);
                        setNumericProperty(harness.shipMgr, sp.boostCommand, maneuvering.boost, undefined);
                    };
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    harness.annotateGraph('test position');
                    expect(harness.shipObj.position.x, 'position').to.be.closeTo(0, metrics.errorMargin);
                    harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                    expect(harness.shipObj.position.x, 'position after stabling').to.be.closeTo(
                        0,
                        metrics.sqrtErrorMargin
                    );
                })
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
                            harness.shipState.maxSpeed
                        );
                        const iteration = (time: number) => {
                            const maneuvering = moveToTarget(time, harness.shipState, XY.zero);
                            setNumericProperty(harness.shipMgr, sp.boostCommand, maneuvering.boost, undefined);
                            setNumericProperty(harness.shipMgr, sp.strafeCommand, maneuvering.strafe, undefined);
                        };
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.position), 'position').to.be.closeTo(0, metrics.errorMargin);
                        harness.simulate(metrics.timeToReach, metrics.iterations, iteration);
                        expect(XY.lengthOf(harness.shipObj.position), 'position after stabling').to.be.closeTo(
                            0,
                            metrics.sqrtErrorMargin
                        );
                    }
                )
            );
        });
    });
});
