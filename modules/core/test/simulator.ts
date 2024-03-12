import {
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    SpaceObject,
    Spaceship,
    limitPercision,
    makeShipState,
    shipConfigurations,
} from '../src';
import { Updateable, isUpdateable } from '../src/updateable';

import { Die } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

const MAX_SIMULATION_TIME = 60 * 60 * 24;
export class SpaceSimulator {
    public spaceMgr = new SpaceManager();
    private updateables: Updateable[] = [];
    constructor(private numIterationsPerSecond: number) {}
    get iterationTimeInSeconds() {
        return limitPercision(1 / this.numIterationsPerSecond);
    }
    withObjects(...objects: SpaceObject[]) {
        this.spaceMgr.insertBulk(objects);
        return this;
    }
    withShip(ship: Spaceship, die: Die, shipManagerCtor: typeof ShipManagerPc | typeof ShipManagerNpc) {
        const shipMgr = new shipManagerCtor(ship, makeShipState(ship.id, dragonflyConfig), this.spaceMgr, die);
        this.updateables.push(shipMgr);
        if (isUpdateable(die)) {
            this.updateables.push(die);
        }
        this.spaceMgr.insert(ship);
        // init shipMgr for testing
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        shipMgr.setShellRangeMode(SmartPilotMode.DIRECT);
        return shipMgr;
    }

    simulateUntilCondition(predicate: (spaceMgr: SpaceManager) => boolean, timeInSeconds = 0) {
        const timeRemainder = Math.abs(
            timeInSeconds - timeInSeconds * this.iterationTimeInSeconds * this.numIterationsPerSecond,
        );
        const timeRange = this.iterationTimeInSeconds * 1.5 + timeRemainder;
        let timePassed = 0;
        const i = makeIterationsData(
            MAX_SIMULATION_TIME,
            MAX_SIMULATION_TIME * this.numIterationsPerSecond,
            (id) => !predicate(this.spaceMgr) && (timeInSeconds <= 0 || id.totalSeconds < timeInSeconds + timeRange),
        );
        for (const id of i) {
            for (const u of this.updateables) {
                u.update(id);
            }
            this.spaceMgr.update(id);
            timePassed += this.iterationTimeInSeconds;
        }
        if (timeInSeconds > 0) {
            expect(timePassed).to.be.closeTo(timeInSeconds, timeRange);
        }
        return this;
    }

    simulateUntilTime(timeInSeconds: number, body?: (spaceMgr: SpaceManager) => unknown) {
        const i = makeIterationsData(timeInSeconds, timeInSeconds * this.numIterationsPerSecond);
        for (const id of i) {
            for (const u of this.updateables) {
                u.update(id);
            }
            this.spaceMgr.update(id);
            if (body) {
                body(this.spaceMgr);
            }
        }
        return this;
    }
}
