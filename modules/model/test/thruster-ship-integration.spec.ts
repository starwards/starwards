import 'mocha';

import { ManeuveringCommand, Vec2, XY, setNumericProperty, shipProperties as sp } from '../src';
import { ShipTestHarness, TimedTestMetrics } from './ship-test-harness';

import { ShipDirection } from '../src/ship/ship-direction';
import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';

describe('thrusters-ship integration', function () {
    this.timeout(60 * 1000);
    const iterationsPerSecond = 5;
    describe('velocityCapacity() is max speed per second', () => {
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
                        setNumericProperty(harness.shipMgr, sp.boostCommand, maneuveringCommand.boost, undefined);
                        setNumericProperty(harness.shipMgr, sp.strafeCommand, maneuveringCommand.strafe, undefined);
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
        testDirectionThruster(ShipDirection.STARBOARD, { boost: 0, strafe: -1 });
        testDirectionThruster(ShipDirection.AFT, { boost: -1, strafe: 0 });
        testDirectionThruster(ShipDirection.PORT, { boost: 0, strafe: 1 });

        it(`(FORE only) 0 for broken thruster`, () => {
            const direction = ShipDirection.FORE;
            fc.assert(
                fc.property(float(0, 0.5), (afterBurner: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                    for (const thruster of harness.shipState.angleThrusters(direction)) {
                        thruster.broken = true;
                    }
                    expect(harness.shipState.velocityCapacity(direction), 'thruster capacity').to.eql(0);
                })
            );
        });
    });

    it(`(FORE only) broken thruster does not work`, () => {
        fc.assert(
            fc.property(float(0, 0.5), (afterBurner: number) => {
                const harness = new ShipTestHarness();
                harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                for (const thruster of harness.shipState.angleThrusters(ShipDirection.FORE)) {
                    thruster.broken = true;
                }
                setNumericProperty(harness.shipMgr, sp.boostCommand, 1, undefined);
                harness.simulate(1, iterationsPerSecond);
                expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.eql(0);
            })
        );
    });
});
