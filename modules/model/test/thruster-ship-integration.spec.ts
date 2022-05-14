import { ManeuveringCommand, Vec2, XY, setNumericProperty, shipProperties as sp } from '../src';
import { ShipTestHarness, TimedTestMetrics } from './ship-test-harness';
import { limitPercisionHard, toPositiveDegreesDelta } from '../src/logic/formulas';

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
                        thruster.broken = true;
                    }
                    expect(harness.shipState.velocityCapacity(direction), 'thruster capacity').to.eql(0);
                })
            );
        });
    });

    it(`(FWD only) broken thruster does not work`, () => {
        fc.assert(
            fc.property(float(0, 0.5), (afterBurner: number) => {
                const harness = new ShipTestHarness();
                harness.shipState.afterBurner = harness.shipState.afterBurnerCommand = afterBurner;
                for (const thruster of harness.shipState.angleThrusters(ShipDirection.FWD)) {
                    thruster.broken = true;
                }
                setNumericProperty(harness.shipMgr, sp.boostCommand, 1, undefined);
                harness.simulate(1, iterationsPerSecond);
                expect(XY.lengthOf(harness.shipObj.velocity), 'velocity').to.eql(0);
            })
        );
    });

    it(`(FWD only) thruster with damaged attitude offsets angle of ship`, () => {
        fc.assert(
            fc.property(float(-180, 180), (offset: number) => {
                const harness = new ShipTestHarness();
                for (const thruster of harness.shipState.angleThrusters(ShipDirection.FWD)) {
                    thruster.angleError = offset;
                }
                setNumericProperty(harness.shipMgr, sp.boostCommand, 1, undefined);
                harness.simulate(1, iterationsPerSecond);
                expect(limitPercisionHard(XY.angleOf(harness.shipObj.velocity)), 'velocity').to.eql(
                    limitPercisionHard(toPositiveDegreesDelta(offset))
                );
            })
        );
    });
});
