import 'mocha';

import {
    ManeuveringCommand,
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
import { MovementTestMetrics, ShipTestHarness, SpeedTestMetrics, TimedTestMetrics } from './ship-test-harness';
import { ShipDirection, ShipDirections } from '../src/ship/ship-direction';
import { float, floatIn, xy } from './properties';

import { GraphPointInput } from './ploty-graph-builder';
import { expect } from 'chai';
import fc from 'fast-check';

const iterationsPerSecond = 20;
describe('thrusters-ship integration', function () {
    this.timeout(60 * 1000);
    const iterationsPerSecond = 5;
    describe('thrusterCapacity() is max speed per second', () => {
        function testDirectionThruster(direction: ShipDirection, maneuveringCommand: ManeuveringCommand) {
            it(ShipDirection[direction], () => {
                fc.assert(
                    fc.property(float(0, 0.5), float(10, 100), (afterBurner: number, customCapacity: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                        for (const thruster of harness.shipState.angleThrusters(direction)) {
                            thruster.constants.set('capacity', customCapacity);
                        }
                        const startVelocity = harness.shipState.maxSpeed;
                        harness.shipObj.velocity = Vec2.make(XY.rotate({ x: -startVelocity, y: 0 }, direction));
                        const thrusterCapacity = harness.shipState.velocityCapacity(direction);
                        setNumericProperty(harness.shipMgr, sp.boostCommand, maneuveringCommand.boost);
                        setNumericProperty(harness.shipMgr, sp.strafeCommand, maneuveringCommand.strafe);
                        const metrics = new TimedTestMetrics(
                            iterationsPerSecond,
                            startVelocity / thrusterCapacity,
                            startVelocity
                        );
                        harness.simulate(metrics.timeToReach, metrics.iterations);
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, metrics.errorMargin);
                    })
                );
            });
        }
        testDirectionThruster(ShipDirection.FORE, { boost: 1, strafe: 0 });
        testDirectionThruster(ShipDirection.STARBOARD, { boost: 0, strafe: 1 });
        testDirectionThruster(ShipDirection.AFT, { boost: -1, strafe: 0 });
        testDirectionThruster(ShipDirection.PORT, { boost: 0, strafe: -1 });
    });
});
