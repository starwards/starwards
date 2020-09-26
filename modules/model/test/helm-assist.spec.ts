import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import { limitPercision, rotationFromTargetTurnSpeed, ShipManager, SpaceManager, Spaceship } from '../src';
import { floatIn } from './properties';

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
    simulate(time: number, iterations: number, body: (time: number) => unknown) {
        const iterationTime = time / iterations;
        this.shipMgr.update(iterationTime);
        this.spaceMgr.update(iterationTime);
        for (let i = 0; i < iterations; i++) {
            body(iterationTime);
            this.shipMgr.update(iterationTime);
            this.spaceMgr.update(iterationTime);
        }
    }
}

describe('helm assist', () => {
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            const MIN_GRACE = 0.01;
            const MIN_TIME = 1;
            fc.assert(
                fc.property(
                    floatIn(2000),
                    floatIn(2000),
                    fc.integer(10, 1000),
                    (turnSpeed: number, targetTurnSpeed: number, iterations: number) => {
                        const harness = new ShipTestHarness();
                        const turnSpeedDiff = Math.abs(targetTurnSpeed - turnSpeed);
                        const errorMargin = Math.max(MIN_GRACE, turnSpeedDiff / Math.sqrt(iterations));
                        const timeToReach = Math.max(MIN_TIME, turnSpeedDiff) / harness.shipState.rotationCapacity;
                        harness.shipObj.turnSpeed = turnSpeed;
                        harness.simulate(timeToReach, iterations, (time: number) => {
                            const rotation = rotationFromTargetTurnSpeed(harness.shipState, targetTurnSpeed, time);
                            harness.shipMgr.setRotation(rotation);
                        });
                        expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(targetTurnSpeed, errorMargin);
                    }
                )
            );
        });
    });
});
