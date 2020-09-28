import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import {
    limitPercision,
    moveToTarget,
    rotationFromTargetTurnSpeed,
    ShipManager,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
} from '../src';
import { floatIn, xy } from './properties';

class ShipTestHarness {
    public spaceMgr = new SpaceManager();
    public shipObj = new Spaceship();
    public shipMgr = new ShipManager(this.shipObj, this.spaceMgr);
    constructor() {
        this.shipObj.id = '1';
        this.spaceMgr.insert(this.shipObj);
    }
    get shipState() {
        return this.shipMgr.state;
    }
    simulate(timeInSeconds: number, iterations: number, body: (time: number) => unknown) {
        const iterationTimeInSeconds = timeInSeconds / iterations;
        this.shipMgr.update(iterationTimeInSeconds);
        this.spaceMgr.update(iterationTimeInSeconds);
        for (let i = 0; i < iterations; i++) {
            body(iterationTimeInSeconds);
            for (let i = 0; i < 5; i++) {
                this.shipMgr.update(iterationTimeInSeconds / 5);
                this.spaceMgr.update(iterationTimeInSeconds / 5);
            }
        }
    }
}

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
            const MIN_GRACE = 1;
            const MIN_TIME = 1;
            fc.assert(
                fc.property(floatIn(2000), fc.integer(50, 500), (fromX: number, iterations: number) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position.x = fromX;
                    const distance = Math.abs(fromX);
                    const errorMargin = Math.max(MIN_GRACE, distance / Math.sqrt(iterations));
                    const timeToReach = Math.max(
                        MIN_TIME,
                        2 * Math.sqrt(distance / harness.shipState.movementCapacity) // from equasion of motion
                    );

                    harness.simulate(timeToReach, iterations, (time: number) => {
                        const maneuvering = moveToTarget(time, harness.shipState, { x: 0, y: 0 });
                        harness.shipMgr.setBoost(maneuvering.boost);
                        // console.log('I', harness.shipState.position.x, harness.shipState.velocity.x, maneuvering.boost);
                    });
                    expect(harness.shipObj.position.x, 'position').to.be.closeTo(0, errorMargin);
                    expect(harness.shipObj.velocity.x, 'velocity').to.be.closeTo(0, 2 * Math.sqrt(errorMargin)); // todo remove the 2 *
                })
            );
        });

        it.skip('acheives target location in a reasonable time from 0 speed', () => {
            const iterations = 10;
            fc.assert(
                fc.property(xy(2000), xy(2000), (from: XY, to: XY) => {
                    const harness = new ShipTestHarness();
                    harness.shipObj.position = Vec2.make(from);
                    const distance = XY.lengthOf(XY.difference(from, to));
                    const errorMargin = distance / Math.sqrt(iterations);
                    const timeToReach = Math.max(1, Math.abs(distance)) / harness.shipState.movementCapacity;

                    harness.simulate(timeToReach, iterations, (time: number) => {
                        const maneuvering = moveToTarget(time, harness.shipState, to);
                        // console.log(`maneuvering`, maneuvering);
                        harness.shipMgr.setBoost(maneuvering.boost);
                        harness.shipMgr.setStrafe(maneuvering.strafe);
                    });
                    // console.log(`result`, harness.shipObj.position.toJSON());
                    expect(XY.lengthOf(XY.difference(harness.shipObj.position, to))).to.be.lte(errorMargin);
                })
            );
        });
    });
});
