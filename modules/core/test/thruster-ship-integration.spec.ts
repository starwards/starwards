import { EPSILON, limitPercisionHard, toPositiveDegreesDelta } from '../src/logic/formulas';
import { ManeuveringCommand, Vec2, XY } from '../src';
import { ShipTestHarness, TimedTestMetrics } from './ship-test-harness';

import { ShipDirection } from '../src/ship/ship-direction';
import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';

describe('thrusters-ship integration', function () {
    jest.setTimeout(60 * 1000);
    const iterationsPerSecond = 5;
    describe('velocityCapacity() is max speed per second', () => {
        function testDirectionThruster(direction: ShipDirection, maneuveringCommand: ManeuveringCommand) {
            it(ShipDirection[direction], () => {
                fc.assert(
                    fc.property(float(0, 0.5), float(10, 100), (afterBurner: number, customCapacity: number) => {
                        const harness = new ShipTestHarness();
                        harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                        for (const thruster of harness.shipState.angleThrusters(direction)) {
                            thruster.design.capacity = customCapacity;
                        }
                        const startVelocity = harness.shipState.maxSpeed;
                        harness.shipObj.velocity.setValue(XY.rotate({ x: -startVelocity, y: 0 }, direction));
                        const thrusterCapacity = harness.shipState.velocityCapacity(direction);
                        harness.shipMgr.state.smartPilot.maneuvering.x = maneuveringCommand.boost;
                        harness.shipMgr.state.smartPilot.maneuvering.y = maneuveringCommand.strafe;
                        const metrics = new TimedTestMetrics(
                            iterationsPerSecond,
                            startVelocity / thrusterCapacity,
                            startVelocity,
                        );
                        harness.simulate(metrics.timeToReach, metrics.iterations);
                        expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, metrics.errorMargin);
                    }),
                );
            });
        }
        testDirectionThruster(ShipDirection.FWD, { boost: 1, strafe: 0 });
        testDirectionThruster(ShipDirection.STBD, { boost: 0, strafe: -1 });
        testDirectionThruster(ShipDirection.AFT, { boost: -1, strafe: 0 });
        testDirectionThruster(ShipDirection.PORT, { boost: 0, strafe: 1 });

        it(`(FWD only) 0 for broken thruster`, () => {
            const direction = ShipDirection.FWD;
            fc.assert(
                fc.property(float(0, 0.5), (afterBurner: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                    for (const thruster of harness.shipState.angleThrusters(direction)) {
                        thruster.availableCapacity = 0;
                    }
                    expect(harness.shipState.velocityCapacity(direction), 'thruster capacity').to.be.closeTo(0, 0);
                }),
            );
        });
    });

    it(`(FWD only) broken thruster does not work`, () => {
        fc.assert(
            fc.property(float(0, 0.5), (afterBurner: number) => {
                const harness = new ShipTestHarness();
                harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                for (const thruster of harness.shipState.angleThrusters(ShipDirection.FWD)) {
                    thruster.availableCapacity = 0;
                }
                harness.shipMgr.state.smartPilot.maneuvering.x = 1;
                harness.simulate(1, iterationsPerSecond);
                expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.be.closeTo(0, 0);
            }),
        );
    });

    it(`(FWD only) thruster with damaged attitude offsets angle of ship`, () => {
        fc.assert(
            fc.property(float(-44, 44), (offset: number) => {
                const harness = new ShipTestHarness();
                for (const thruster of harness.shipState.angleThrusters(ShipDirection.FWD)) {
                    thruster.angleError = offset;
                }
                harness.shipMgr.state.smartPilot.maneuvering.x = 1;
                harness.simulate(1, iterationsPerSecond);
                expect(limitPercisionHard(XY.angleOf(harness.shipObj.velocity)), 'velocity').to.be.closeTo(
                    limitPercisionHard(toPositiveDegreesDelta(offset)),
                    EPSILON * 5,
                );
            }),
        );
    });
});
