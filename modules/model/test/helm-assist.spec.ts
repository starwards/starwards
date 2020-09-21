import { expect } from 'chai';
import fc from 'fast-check';
import 'mocha';
import { rotationFromTargetTurnSpeed, ShipManager, SpaceManager, Spaceship } from '../src';
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
    simulate(time: number, iterations: number, body: () => unknown) {
        const iterationTime = time / iterations;
        this.shipMgr.update(iterationTime);
        this.spaceMgr.update(iterationTime);
        for (let i = 0; i < iterations; i++) {
            body();
            this.shipMgr.update(iterationTime);
            this.spaceMgr.update(iterationTime);
        }
    }
}

describe('helm assist', () => {
    describe('rotationFromTargetTurnSpeed', () => {
        it('acheives target turnSpeed in a reasonable time', () => {
            const ITERATIONS = 10;
            fc.assert(
                fc.property(floatIn(2000), floatIn(2000), (turnSpeed: number, targetTurnSpeed: number) => {
                    const harness = new ShipTestHarness();
                    const turnSpeedDiff = Math.abs(targetTurnSpeed - turnSpeed);
                    const errorMargin = turnSpeedDiff / Math.sqrt(ITERATIONS);
                    const timeToReach = Math.max(1, Math.abs(turnSpeedDiff)) / harness.shipState.rotationCapacity;
                    harness.shipObj.turnSpeed = turnSpeed;
                    harness.simulate(timeToReach, ITERATIONS, () => {
                        const rotation = rotationFromTargetTurnSpeed(harness.shipState, targetTurnSpeed);
                        harness.shipMgr.setRotation(rotation);
                    });
                    expect(harness.shipObj.turnSpeed).to.be.closeTo(targetTurnSpeed, errorMargin);
                })
            );
        });
    });
});
